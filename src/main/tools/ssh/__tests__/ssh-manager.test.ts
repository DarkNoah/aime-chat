/* eslint-disable no-control-regex, no-use-before-define */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const spawnedPtys: FakePty[] = [];
let mockId = 0;
const mockSendEvent = jest.fn(() => Promise.resolve());
const mockSpawn = jest.fn((..._args: unknown[]) => {
  const pty = new FakePty();
  spawnedPtys.push(pty);
  return pty;
});

jest.mock('node-pty', () => ({
  spawn: mockSpawn,
}));

jest.mock('@/main/app', () => ({
  appManager: {
    sendEvent: mockSendEvent,
  },
}));

jest.mock('fix-path', () => jest.fn());

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => {
    mockId += 1;
    return `ssh-${mockId}`;
  }),
}));

jest.mock('strip-ansi', () =>
  jest.fn((value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')),
);

type DataListener = (data: string) => void;
type ExitListener = (event: { exitCode: number; signal?: number }) => void;

class FakePty {
  pid = 100;

  cols = 120;

  rows = 30;

  process = 'ssh';

  handleFlowControl = false;

  writes: string[] = [];

  private dataListeners = new Set<DataListener>();

  private exitListeners = new Set<ExitListener>();

  onData = (listener: DataListener) => {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  };

  onExit = (listener: ExitListener) => {
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  };

  write = (data: string) => {
    this.writes.push(data);
  };

  kill = () => {
    this.emitExit(0, 0);
  };

  resize = jest.fn();

  clear = jest.fn();

  pause = jest.fn();

  resume = jest.fn();

  emitData(data: string) {
    this.dataListeners.forEach((listener) => listener(data));
  }

  emitExit(exitCode: number, signal?: number) {
    this.exitListeners.forEach((listener) => listener({ exitCode, signal }));
  }
}

describe('SSH target helpers', () => {
  it('builds config and direct OpenSSH argument arrays without shell interpolation', async () => {
    const {
      buildSSHLaunchSpec,
      getDefaultSSHConfigPath,
      getWindowsOpenSSHPath,
    } = await import('../manager');
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-ssh-'));
    const configPath = path.join(tempDirectory, 'config');
    fs.writeFileSync(configPath, 'Host prod\n  HostName 192.0.2.5\n');

    try {
      expect(
        buildSSHLaunchSpec(
          { type: 'config', name: 'prod' },
          { executable: '/usr/bin/ssh', configPath },
        ),
      ).toMatchObject({
        executable: '/usr/bin/ssh',
        args: ['-F', configPath, '-tt', '--', 'prod'],
        targetKey: 'config:prod',
      });

      expect(
        buildSSHLaunchSpec(
          {
            type: 'direct',
            host: '0:0:0:0:0:0:0:1',
            port: 2222,
            username: 'root',
          },
          { executable: '/usr/bin/ssh', configPath },
        ),
      ).toMatchObject({
        args: ['-F', configPath, '-tt', '-p', '2222', '--', 'root@::1'],
        targetKey: 'direct:root@::1:2222',
      });

      expect(getDefaultSSHConfigPath('C:\\Users\\Noah', 'win32')).toBe(
        'C:\\Users\\Noah\\.ssh\\config',
      );
      expect(getWindowsOpenSSHPath('C:\\Windows')).toBe(
        'C:\\Windows\\System32\\OpenSSH\\ssh.exe',
      );
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('rejects malformed direct targets and ports', async () => {
    const { normalizeSSHTarget } = await import('../manager');
    expect(() =>
      normalizeSSHTarget({ type: 'direct', host: 'example.com', port: 22 }),
    ).toThrow('valid IPv4 or IPv6');
    expect(() =>
      normalizeSSHTarget({ type: 'direct', host: '192.0.2.1', port: 70000 }),
    ).toThrow('between 1 and 65535');
    expect(() =>
      normalizeSSHTarget({ type: 'config', name: '-oProxyCommand' }),
    ).toThrow('config host name is invalid');
  });
});

describe('SSHManager', () => {
  beforeEach(() => {
    spawnedPtys.length = 0;
    mockId = 0;
    mockSpawn.mockClear();
    mockSendEvent.mockClear();
  });

  it('reuses one application-wide active connection per normalized target', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const target = { type: 'direct', host: '192.0.2.10', port: 22 } as const;

    const first = await manager.create(target, { wait_timeout_ms: 0 });
    const second = await manager.create(target, { wait_timeout_ms: 0 });

    expect(second.connection_id).toBe(first.connection_id);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(manager.getSessionSummaries()).toEqual([
      {
        connectionId: first.connection_id,
        target,
        state: 'running',
      },
    ]);
    manager.disposeAll();
  });

  it('returns only the reconstructed current ANSI screen state', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const target = { type: 'direct', host: '192.0.2.11', port: 22 } as const;
    const created = await manager.create(target, { wait_timeout_ms: 0 });
    const session = manager.getSession({
      connection_id: created.connection_id,
    });

    spawnedPtys[0].emitData('old screen\r\n');
    spawnedPtys[0].emitData('\u001b[2J\u001b[Hmenu\r\nitem two');
    const firstRead = await manager.read(session, 0);
    const secondRead = await manager.read(session, 0);

    expect(firstRead).not.toHaveProperty('new_output');
    expect(firstRead).not.toHaveProperty('output_truncated');
    expect(firstRead.screen).toBe('menu\nitem two');
    expect(secondRead.screen).toBe('menu\nitem two');
    manager.disposeAll();
  });

  it('tracks the alternate terminal buffer used by interactive CLIs', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const created = await manager.create(
      { type: 'direct', host: '192.0.2.16' },
      { wait_timeout_ms: 0 },
    );
    const session = manager.getSession({
      connection_id: created.connection_id,
    });

    spawnedPtys[0].emitData('normal shell');
    await manager.read(session, 0);
    spawnedPtys[0].emitData(
      '\u001b[?1049h\u001b[2J\u001b[Hchoose one\r\n> second',
    );

    const alternate = await manager.read(session, 0);
    expect(alternate.screen).toBe('choose one\n> second');

    spawnedPtys[0].emitData('\u001b[?1049l');
    const restored = await manager.read(session, 0);
    expect(restored.screen).toBe('normal shell');
    manager.disposeAll();
  });

  it('returns the latest screen after background output arrives', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const created = await manager.create(
      { type: 'direct', host: '192.0.2.12' },
      { wait_timeout_ms: 0 },
    );
    const session = manager.getSession({
      connection_id: created.connection_id,
    });

    const background = await manager.write(session, 'uptime\r', {
      runInBackground: true,
    });
    expect(background.input_sent).toBe(true);
    expect(background).not.toHaveProperty('new_output');
    expect(spawnedPtys[0].writes).toEqual(['uptime\r']);

    spawnedPtys[0].emitData('up 3 days\r\n');
    const output = await manager.read(session, 0);
    expect(output.screen).toContain('up 3 days');
    manager.disposeAll();
  });

  it('redacts a Secret even if the remote PTY echoes it', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const created = await manager.create(
      { type: 'direct', host: '192.0.2.14' },
      { wait_timeout_ms: 0 },
    );
    const session = manager.getSession({
      connection_id: created.connection_id,
    });

    await manager.write(session, 'super-secret\r', {
      runInBackground: true,
      secretValue: 'super-secret',
    });
    spawnedPtys[0].emitData('echo: super-secret\r\n');
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });

    const output = await manager.read(session, 0);
    expect(JSON.stringify(output)).not.toContain('super-secret');
    expect(output.screen).toContain('[REDACTED]');
    expect(JSON.stringify(mockSendEvent.mock.calls)).not.toContain(
      'super-secret',
    );
    expect(mockSendEvent).toHaveBeenCalledWith(
      'chat:ssh-session-updated',
      expect.objectContaining({
        data: expect.objectContaining({
          connectionId: created.connection_id,
          event: 'output',
          outputDelta: expect.stringContaining('[REDACTED]'),
        }),
      }),
    );
    manager.disposeAll();
  });

  it('returns only the configured terminal viewport instead of an output log', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const created = await manager.create(
      { type: 'direct', host: '192.0.2.15' },
      { wait_timeout_ms: 0 },
    );
    const session = manager.getSession({
      connection_id: created.connection_id,
    });

    spawnedPtys[0].emitData('x'.repeat(12_000));
    const output = await manager.read(session, 0);

    expect(output).not.toHaveProperty('new_output');
    expect(output.screen.length).toBeLessThanOrEqual(120 * 30 + 29);
    manager.disposeAll();
  });

  it('releases a target on exit while retaining final output by connection ID', async () => {
    const { SSHManager } = await import('../manager');
    const manager = new SSHManager();
    const target = { type: 'direct', host: '192.0.2.13' } as const;
    const first = await manager.create(target, { wait_timeout_ms: 0 });

    spawnedPtys[0].emitData('connection closed\r\n');
    spawnedPtys[0].emitExit(255, 0);

    const replacement = await manager.create(target, { wait_timeout_ms: 0 });
    expect(replacement.connection_id).not.toBe(first.connection_id);
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    const exitedSession = manager.getSession({
      connection_id: first.connection_id,
    });
    const finalOutput = await manager.read(exitedSession, 0);
    expect(finalOutput.state).toBe('exited');
    expect(finalOutput.exit_code).toBe(255);
    expect(finalOutput.screen).toContain('connection closed');
    expect(
      manager.getSession({ connection_id: first.connection_id }),
    ).toBeUndefined();
    manager.disposeAll();
  });
});
