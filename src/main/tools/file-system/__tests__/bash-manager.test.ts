jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/aime-chat-test'),
  },
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
  decodeBuffer: jest.fn(),
  runCommand: jest.fn(),
}));

jest.mock('@/main/utils/runtimePython', () => ({
  getRuntimePython: jest.fn((env) => Promise.resolve(env)),
}));

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

jest.mock('strip-ansi', () => jest.fn((value) => value));

describe('BashManager', () => {
  it('filters sessions by project resource id', async () => {
    const { BashManager } = await import('../bash');
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
});
