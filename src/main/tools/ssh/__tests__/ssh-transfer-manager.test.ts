/* eslint-disable no-control-regex, no-use-before-define */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const spawnedPtys: FakePty[] = [];
const mockSpawn = jest.fn(() => {
  const pty = new FakePty();
  spawnedPtys.push(pty);
  return pty;
});

jest.mock('node-pty', () => ({ spawn: mockSpawn }));
jest.mock('fix-path', () => jest.fn());
jest.mock('@/main/app', () => ({
  appManager: { sendEvent: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'ssh-test'),
}));
jest.mock('strip-ansi', () =>
  jest.fn((value: string) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')),
);

type DataListener = (data: string) => void;
type ExitListener = (event: { exitCode: number; signal?: number }) => void;

class FakePty {
  pid = 101;

  cols = 120;

  rows = 20;

  process = 'scp';

  handleFlowControl = false;

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

  write = jest.fn();

  kill = jest.fn(() => this.emitExit(1, 0));

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

describe('SSH SCP transfer helpers', () => {
  beforeEach(() => {
    spawnedPtys.length = 0;
    mockSpawn.mockClear();
  });

  it('builds config upload and direct IPv6 download argument arrays', async () => {
    const { buildSCPLaunchSpec } = await import('../transfer-manager');
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-scp-'));
    const configPath = path.join(tempDirectory, 'config');
    const uploadPath = path.join(tempDirectory, 'local file.txt');
    fs.writeFileSync(configPath, 'Host production\n  HostName 192.0.2.8\n');
    fs.writeFileSync(uploadPath, 'payload');

    try {
      expect(
        buildSCPLaunchSpec({
          target: { type: 'config', name: 'production' },
          direction: 'upload',
          localPath: uploadPath,
          remotePath: '/tmp/remote file.txt',
          executable: '/usr/bin/scp',
          configPath,
        }),
      ).toMatchObject({
        executable: '/usr/bin/scp',
        args: [
          '-F',
          configPath,
          '--',
          uploadPath,
          'production:/tmp/remote file.txt',
        ],
      });

      const downloadPath = path.join(tempDirectory, 'download.txt');
      expect(
        buildSCPLaunchSpec({
          target: {
            type: 'direct',
            host: '0:0:0:0:0:0:0:1',
            port: 2222,
            username: 'root',
          },
          direction: 'download',
          localPath: downloadPath,
          remotePath: '/tmp/source.txt',
          executable: '/usr/bin/scp',
          configPath: path.join(tempDirectory, 'missing-config'),
        }),
      ).toMatchObject({
        args: ['-P', '2222', '--', 'root@[::1]:/tmp/source.txt', downloadPath],
      });
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('constructs Windows OpenSSH and local paths with path.win32', async () => {
    const { getWindowsOpenSCPPath, resolveTransferLocalPath } =
      await import('../transfer-manager');
    expect(getWindowsOpenSCPPath('C:\\Windows')).toBe(
      'C:\\Windows\\System32\\OpenSSH\\scp.exe',
    );
    expect(
      resolveTransferLocalPath('~\\Downloads\\file.txt', {
        platform: 'win32',
        homeDirectory: 'C:\\Users\\Noah',
        cwd: 'C:\\workspace',
      }),
    ).toBe('C:\\Users\\Noah\\Downloads\\file.txt');
  });

  it('waits for successful completion and returns the final SCP screen', async () => {
    const { SSHTransferManager } = await import('../transfer-manager');
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-scp-'));
    const uploadPath = path.join(tempDirectory, 'file.txt');
    fs.writeFileSync(uploadPath, 'payload');
    const manager = new SSHTransferManager();

    const transferPromise = manager.transfer({
      connectionId: 'ssh-1',
      target: { type: 'direct', host: '192.0.2.9', port: 22 },
      direction: 'upload',
      localPath: uploadPath,
      remotePath: '/tmp/file.txt',
      executable: '/usr/bin/scp',
    });
    spawnedPtys[0].emitData('file.txt 100%\r\n');
    spawnedPtys[0].emitExit(0, 0);

    const output = await transferPromise;
    expect(output.state).toBe('exited');
    expect(output.exit_code).toBe(0);
    expect(output.screen).toContain('file.txt 100%');
    manager.disposeAll();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('terminates instead of waiting on an authentication prompt', async () => {
    const { SSHTransferManager } = await import('../transfer-manager');
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-scp-'));
    const uploadPath = path.join(tempDirectory, 'file.txt');
    fs.writeFileSync(uploadPath, 'payload');
    const manager = new SSHTransferManager();

    const transferPromise = manager.transfer({
      connectionId: 'ssh-2',
      target: { type: 'direct', host: '192.0.2.10', port: 22 },
      direction: 'upload',
      localPath: uploadPath,
      remotePath: '/tmp/file.txt',
      executable: '/usr/bin/scp',
    });
    spawnedPtys[0].emitData("root@192.0.2.10's password: ");

    const output = await transferPromise;
    expect(spawnedPtys[0].kill).toHaveBeenCalledTimes(1);
    expect(output.state).toBe('error');
    expect(output.error).toContain('key-based authentication');
    manager.disposeAll();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });
});
