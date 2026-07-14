import {
  formatSSHSessionOutput,
  SSHInput,
  SSHOutput,
  SSHTransfer,
  sshManager,
  sshTransferManager,
} from '..';
import { secretsManager } from '@/main/app/secrets';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/aime-chat-test'),
  },
}));

jest.mock('@/main/app', () => ({
  appManager: {
    getInfo: jest.fn(() =>
      Promise.resolve({
        apiServer: { enabled: false, port: 0 },
        defaultModel: {},
      }),
    ),
  },
}));

jest.mock('@/main/providers', () => ({
  providersManager: {},
}));

jest.mock('@/main/db', () => ({
  dbManager: {},
}));

jest.mock('@/main/app/secrets', () => ({
  secretsManager: {
    getSecretsEnv: jest.fn(),
  },
}));

jest.mock('node-pty', () => ({
  spawn: jest.fn(),
}));

jest.mock('@xterm/headless', () => ({
  Terminal: jest.fn(),
}));

jest.mock('strip-ansi', () => jest.fn((value: string) => value));

jest.mock('fix-path', () => jest.fn());

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'ssh-test'),
}));

describe('SSH tools', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires an existing connection_id and never auto-creates a target', async () => {
    jest.spyOn(sshManager, 'getSession').mockReturnValue(undefined);
    const createSpy = jest.spyOn(sshManager, 'create');
    const writeSpy = jest.spyOn(sshManager, 'write');

    await expect(
      new SSHInput().execute(
        {
          connection_id: 'missing',
          text: 'whoami',
          append_enter: true,
          run_in_background: false,
          wait_timeout_ms: 10,
        },
        undefined,
      ),
    ).rejects.toThrow('SSH connection was not found for connection_id missing');

    expect(createSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('does not accept target-only selectors for input or output', () => {
    const targetOnly = {
      target: { type: 'config', name: 'server' },
      text: 'whoami',
    };

    expect(new SSHInput().inputSchema.safeParse(targetOnly).success).toBe(
      false,
    );
    expect(
      new SSHOutput().inputSchema.safeParse({
        target: targetOnly.target,
      }).success,
    ).toBe(false);
    expect(
      new SSHInput().inputSchema.safeParse({
        connection_id: 'ssh-1',
        target: targetOnly.target,
        text: 'whoami',
      }).success,
    ).toBe(false);
    expect(
      new SSHOutput().inputSchema.safeParse({
        connection_id: 'ssh-1',
        target: targetOnly.target,
      }).success,
    ).toBe(false);
  });

  it('writes a Secret without returning or logging its value', async () => {
    const session = {} as any;
    jest.spyOn(sshManager, 'getSession').mockReturnValue(session);
    jest
      .spyOn(secretsManager, 'getSecretsEnv')
      .mockResolvedValue({ SSH_PASSWORD: 'super-secret' });
    const writeSpy = jest.spyOn(sshManager, 'write').mockResolvedValue({
      connection_id: 'ssh-2',
      target: { type: 'direct', host: '192.0.2.21', port: 22 },
      state: 'running',
      input_sent: true,
      screen: 'welcome',
      cursor: { row: 0, column: 7 },
    });

    const result = await new SSHInput().execute(
      {
        connection_id: 'ssh-2',
        secret_name: 'SSH_PASSWORD',
        append_enter: true,
        run_in_background: false,
        wait_timeout_ms: 3000,
      },
      undefined,
    );

    expect(writeSpy).toHaveBeenCalledWith(session, 'super-secret\r', {
      runInBackground: false,
      waitTimeoutMs: 3000,
      secretValue: 'super-secret',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret');
    expect(result).toContain('# SSH Session');
    expect(result).not.toContain('## New output');
    expect(result).toContain('## Screen');
  });

  it('formats arbitrary terminal output as valid fenced Markdown', () => {
    const markdown = formatSSHSessionOutput({
      connection_id: 'ssh-md',
      target: { type: 'config', name: 'production' },
      state: 'running',
      screen: 'contains ``` fence',
      cursor: { row: 1, column: 2 },
    });

    expect(markdown).toContain('| Connection ID | ssh-md |');
    expect(markdown).toContain('````text\ncontains ``` fence\n````');
  });

  it('keeps the transfer API limited to foreground upload and download', () => {
    const schema = new SSHTransfer().inputSchema;
    expect(
      schema.safeParse({
        action: 'upload',
        connection_id: 'ssh-4',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: 'output',
        connection_id: 'ssh-4',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: 'download',
        connection_id: 'ssh-4',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
        run_in_background: true,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: 'download',
        connection_id: 'ssh-4',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
        secret_name: 'SSH_PASSWORD',
      }).success,
    ).toBe(false);
  });

  it('waits for one foreground transfer and formats its final screen', async () => {
    const session = {
      connectionId: 'ssh-4',
      target: { type: 'config', name: 'production' },
      state: 'running',
    } as any;
    jest.spyOn(sshManager, 'getSession').mockReturnValue(session);
    const transferSpy = jest
      .spyOn(sshTransferManager, 'transfer')
      .mockResolvedValue({
        connection_id: 'ssh-4',
        target: session.target,
        direction: 'upload',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
        state: 'exited',
        screen: 'local.txt 100%',
        cursor: { row: 0, column: 14 },
        exit_code: 0,
      });

    const result = await new SSHTransfer().execute(
      {
        action: 'upload',
        connection_id: 'ssh-4',
        local_path: '/tmp/local.txt',
        remote_path: '/tmp/remote.txt',
        recursive: false,
      },
      undefined,
    );

    expect(transferSpy).toHaveBeenCalledWith({
      connectionId: 'ssh-4',
      target: session.target,
      direction: 'upload',
      localPath: '/tmp/local.txt',
      remotePath: '/tmp/remote.txt',
      recursive: false,
    });
    expect(result).toContain('# SSH Transfer');
    expect(result).toContain('local.txt 100%');
  });

  it.each([
    ['up', '\u001b[A'],
    ['down', '\u001b[B'],
    ['right', '\u001b[C'],
    ['left', '\u001b[D'],
    ['enter', '\r'],
    ['tab', '\t'],
    ['escape', '\u001b'],
    ['backspace', '\u007f'],
    ['space', ' '],
    ['ctrl_c', '\u0003'],
    ['ctrl_d', '\u0004'],
  ])('maps the %s key to PTY bytes', async (key, expected) => {
    const session = {} as any;
    jest.spyOn(sshManager, 'getSession').mockReturnValue(session);
    const writeSpy = jest.spyOn(sshManager, 'write').mockResolvedValue({
      connection_id: 'ssh-3',
      target: { type: 'direct', host: '192.0.2.22', port: 22 },
      state: 'running',
      input_sent: true,
      screen: '',
      cursor: { row: 0, column: 0 },
    });

    await new SSHInput().execute(
      {
        connection_id: 'ssh-3',
        key: key as any,
        append_enter: true,
        run_in_background: true,
        wait_timeout_ms: 0,
      },
      undefined,
    );

    expect(writeSpy).toHaveBeenCalledWith(session, expected, {
      runInBackground: true,
      waitTimeoutMs: 0,
    });
  });
});
