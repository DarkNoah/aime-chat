import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { BashManager } from '../bash';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/aime-chat-test'),
  },
}));

jest.mock('@mastra/core/tools', () => ({
  createTool: jest.fn(),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

jest.mock('@/main/app', () => ({
  appManager: {
    sendEvent: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('@/main/app/runtime', () => ({
  getBunRuntime: jest.fn(),
  getUVRuntime: jest.fn(),
}));

jest.mock('@/main/app/secrets', () => ({
  secretsManager: {
    getSecretsEnv: jest.fn(() => Promise.resolve({})),
  },
}));

jest.mock('@/main/utils/shell', () => ({
  attachAbortHandler: jest.fn(),
  createManagedAbortController: jest.fn(),
  createShell: jest.fn(),
  decodeBuffer: jest.fn((value: Buffer) => value.toString('utf8')),
  runCommand: jest.fn(),
}));

jest.mock('@/main/utils/runtimePython', () => ({
  getRuntimePython: jest.fn((env) => Promise.resolve(env)),
}));

jest.mock('@/main/utils/getEnv', () => ({
  getEnv: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

jest.mock('strip-ansi', () => jest.fn((value) => value));

const shellUtils = jest.requireMock('@/main/utils/shell') as {
  attachAbortHandler: jest.Mock;
  createManagedAbortController: jest.Mock;
  createShell: jest.Mock;
};

function createFakeShell() {
  const shell = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
  };
  shell.stdout = new PassThrough();
  shell.stderr = new PassThrough();
  shell.pid = 1234;
  return shell;
}

type FakeShell = ReturnType<typeof createFakeShell>;
type BashManagerInstance = InstanceType<typeof BashManager>;

function configureShell(shell: FakeShell, timedOut = false) {
  const abortController = new AbortController();
  shellUtils.createShell.mockResolvedValue({
    shell,
    tempFilePath: undefined,
    command: 'test command',
  });
  shellUtils.createManagedAbortController.mockReturnValue({
    abortController,
    abortSignal: abortController.signal,
    cleanup: jest.fn(),
    didTimeout: jest.fn(() => timedOut),
  });
  shellUtils.attachAbortHandler.mockReturnValue(jest.fn());
}

async function waitForSession(manager: BashManagerInstance, bashId: string) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  expect(
    manager.getBashSessions().some((session) => session.bashId === bashId),
  ).toBe(true);
}

describe('BashManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters sessions by project resource id', () => {
    const manager = new BashManager();

    (manager as any).bashMap.set('normal', {
      bashId: 'normal',
      threadId: 'thread-normal',
      resourceId: 'default',
      isExited: false,
    });
    (manager as any).bashMap.set('project-a-1', {
      bashId: 'project-a-1',
      threadId: 'thread-a-1',
      resourceId: 'project:a',
      isExited: false,
    });
    (manager as any).bashMap.set('project-a-2', {
      bashId: 'project-a-2',
      threadId: 'thread-a-2',
      resourceId: 'project:a',
      isExited: true,
    });
    (manager as any).bashMap.set('project-b', {
      bashId: 'project-b',
      threadId: 'thread-b',
      resourceId: 'project:b',
      isExited: false,
    });

    const sessions = manager.getBashSessions({ resourceId: 'project:a' });

    expect(sessions.map((session) => session.bashId)).toEqual([
      'project-a-1',
      'project-a-2',
    ]);
  });

  it.each([
    { name: 'successful exit', code: 0, signal: null, timedOut: false },
    { name: 'non-zero exit', code: 2, signal: null, timedOut: false },
    { name: 'timeout', code: null, signal: 'SIGTERM', timedOut: true },
    {
      name: 'signal termination',
      code: null,
      signal: 'SIGKILL',
      timedOut: false,
    },
  ])('notifies once after $name', async ({ code, signal, timedOut }) => {
    const manager = new BashManager();
    const shell = createFakeShell();
    configureShell(shell, timedOut);
    const listener = jest.fn();
    manager.onSessionCompleted(listener);

    const run = manager.runInBackground(
      { command: 'test command', description: 'test description' },
      'bash-1',
      '/tmp/workspace',
      {},
      undefined,
      undefined,
      'thread-1',
      'project:1',
    );
    await waitForSession(manager, 'bash-1');

    shell.stdout.emit('data', Buffer.from('stdout text'));
    shell.stderr.emit('data', Buffer.from('stderr text'));
    shell.emit('exit', code, signal);
    shell.stdout.emit('data', Buffer.from(' after exit'));
    shell.emit('close', code, signal);
    await run;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        bashId: 'bash-1',
        threadId: 'thread-1',
        resourceId: 'project:1',
        command: 'test command',
        description: 'test description',
        exitCode: code,
        processSignal: signal,
        timedOut,
      }),
    );
    expect(manager.get('bash-1')).toEqual(
      expect.objectContaining({
        isExited: true,
        exitCode: code ?? undefined,
        processSignal: signal ?? undefined,
        timedOut,
      }),
    );
    expect(
      manager
        .get('bash-1')
        ?.stdout.map((item) => item.content)
        .join(''),
    ).toBe('stdout text after exit');
    expect(manager.get('bash-1')?.stderr[0].content).toBe('stderr text');
  });

  it('finalizes a spawn error on close and exposes the error message', async () => {
    const manager = new BashManager();
    const shell = createFakeShell();
    configureShell(shell);
    const listener = jest.fn();
    manager.onSessionCompleted(listener);

    const run = manager.runInBackground(
      { command: 'test command' },
      'bash-error',
      '/tmp/workspace',
      {},
      undefined,
      undefined,
      'thread-error',
      'default',
    );
    await waitForSession(manager, 'bash-error');

    shell.emit('error', new Error('spawn failed for test command'));
    shell.emit('close', -2, null);
    await run;

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        bashId: 'bash-error',
        exitCode: -2,
        errorMessage: 'spawn failed for test command',
      }),
    );
  });

  it('unsubscribes completion listeners', async () => {
    const manager = new BashManager();
    const shell = createFakeShell();
    configureShell(shell);
    const listener = jest.fn();
    const unsubscribe = manager.onSessionCompleted(listener);
    unsubscribe();

    const run = manager.runInBackground(
      { command: 'test command' },
      'bash-unsubscribed',
      '/tmp/workspace',
    );
    await waitForSession(manager, 'bash-unsubscribed');
    shell.emit('exit', 0, null);
    await run;

    expect(listener).not.toHaveBeenCalled();
  });
});
