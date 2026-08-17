import fs from 'fs';
import {
  ensureManagedPythonRuntime,
  inspectManagedPythonRuntime,
  setupManagedPythonRuntime,
} from '../python-runtime-environment';

const baseOptions = {
  uvDir: '/runtime/bin',
  userDataDir: '/runtime/user-data',
  packageCacheDir: '/runtime/cache',
  packageIndex: 'https://example.test/simple/',
  commandEnv: { UV_CACHE_DIR: '/runtime/cache' },
  isWindows: false,
  isOnline: () => true,
};

describe('managed Python runtime setup', () => {
  let existsSyncSpy: jest.SpyInstance;
  let mkdirSyncSpy: jest.SpyInstance;
  let mkdirSpy: jest.SpyInstance;
  let rmSpy: jest.SpyInstance;

  beforeEach(() => {
    existsSyncSpy = jest.spyOn(fs, 'existsSync');
    mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    mkdirSpy = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
    rmSpy = jest.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    mkdirSpy.mockRestore();
    rmSpy.mockRestore();
  });

  it('marks only Python 3.12 as an installed managed runtime', async () => {
    existsSyncSpy.mockReturnValue(true);
    const runCommand = jest
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'Python 3.10.18\n' })
      .mockResolvedValueOnce({ code: 0, stdout: 'pip 25.0\n' });

    await expect(
      inspectManagedPythonRuntime(baseOptions.userDataDir, false, runCommand),
    ).resolves.toEqual(
      expect.objectContaining({ installed: false, pythonVersion: '3.10.18' }),
    );
  });

  it('keeps an existing Python 3.12 runtime', async () => {
    existsSyncSpy.mockReturnValue(true);
    const runCommand = jest
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'Python 3.12.12\n' })
      .mockResolvedValueOnce({ code: 0, stdout: 'pip 26.0.1\n' });

    await expect(
      setupManagedPythonRuntime({ ...baseOptions, runCommand }),
    ).resolves.toBe(true);

    expect(rmSpy).not.toHaveBeenCalled();
    expect(
      runCommand.mock.calls.some(([command]) =>
        String(command).includes(' venv '),
      ),
    ).toBe(false);
  });

  it('replaces an incompatible runtime with Python 3.12 offline', async () => {
    existsSyncSpy.mockReturnValue(true);
    let pythonVersionChecks = 0;
    const runCommand = jest.fn(async (command: string) => {
      if (command.includes(' venv ')) return { code: 0 };
      if (command.includes('/bin/python" --version')) {
        pythonVersionChecks += 1;
        return {
          code: 0,
          stdout:
            pythonVersionChecks === 1 ? 'Python 3.10.18\n' : 'Python 3.12.12\n',
        };
      }
      if (command.includes('/bin/pip" --version')) {
        return { code: 0, stdout: 'pip 26.0.1\n' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(
      setupManagedPythonRuntime({
        ...baseOptions,
        isOnline: () => false,
        runCommand,
      }),
    ).resolves.toBe(true);

    expect(rmSpy).toHaveBeenCalledWith(
      '/runtime/user-data/.runtime/python-runtime/.venv',
      { recursive: true, force: true },
    );
    const createCommand = runCommand.mock.calls
      .map(([command]) => String(command))
      .find((command) => command.includes(' venv '));
    expect(createCommand).toContain('--python "3.12"');
    expect(createCommand).toContain('--offline');
    expect(createCommand).not.toContain('--seed');
  });

  it('does not require pip seed packages to use cached Python 3.12', async () => {
    existsSyncSpy.mockImplementation((value) =>
      String(value).endsWith('/bin/python'),
    );
    const runCommand = jest
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'Python 3.12.12\n' })
      .mockResolvedValueOnce({ code: 1, stderr: 'not cached' });

    await expect(
      setupManagedPythonRuntime({
        ...baseOptions,
        isOnline: () => false,
        runCommand,
      }),
    ).resolves.toBe(true);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls[1][0]).toContain('pip install');
    expect(runCommand.mock.calls[1][0]).toContain('--offline');
  });

  it('does not attempt an online download while offline', async () => {
    existsSyncSpy.mockReturnValue(false);
    const runCommand = jest.fn().mockResolvedValue({
      code: 1,
      stderr: 'Python 3.12 is not cached',
    });

    await expect(
      setupManagedPythonRuntime({
        ...baseOptions,
        isOnline: () => false,
        runCommand,
      }),
    ).resolves.toBe(false);

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0][0]).toContain('--offline');
  });

  it('falls back to downloading Python 3.12 only when online', async () => {
    let pythonCreated = false;
    existsSyncSpy.mockImplementation((value) =>
      String(value).endsWith('/bin/python') ? pythonCreated : false,
    );
    const runCommand = jest.fn(async (command: string) => {
      if (command.includes(' venv ') && command.includes('--offline')) {
        return { code: 1, stderr: 'Python 3.12 is not cached' };
      }
      if (command.includes(' venv ')) {
        pythonCreated = true;
        return { code: 0 };
      }
      if (command.includes('pip install')) {
        return { code: 1, stderr: 'pip is optional' };
      }
      if (command.includes('/bin/python" --version')) {
        return { code: 0, stdout: 'Python 3.12.12\n' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await expect(
      setupManagedPythonRuntime({ ...baseOptions, runCommand }),
    ).resolves.toBe(true);

    const venvCommands = runCommand.mock.calls
      .map(([command]) => String(command))
      .filter((command) => command.includes(' venv '));
    expect(venvCommands).toHaveLength(2);
    expect(venvCommands[0]).toContain('--offline');
    expect(venvCommands[1]).not.toContain('--offline');
  });

  it('shares one setup while concurrent callers wait for Python 3.12', async () => {
    existsSyncSpy.mockImplementation((value) =>
      String(value).endsWith('/bin/python'),
    );
    let resolveVersion: (result: { code: number; stdout: string }) => void;
    const versionResult = new Promise<{ code: number; stdout: string }>(
      (resolve) => {
        resolveVersion = resolve;
      },
    );
    const runCommand = jest.fn((command: string) =>
      command.includes('--version')
        ? versionResult
        : Promise.resolve({ code: 1, stderr: 'pip is optional' }),
    );
    const options = {
      ...baseOptions,
      isOnline: () => false,
      runCommand,
    };

    const first = ensureManagedPythonRuntime(options);
    const second = ensureManagedPythonRuntime(options);

    expect(first).toBe(second);
    resolveVersion!({ code: 0, stdout: 'Python 3.12.12\n' });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(
      runCommand.mock.calls.filter(([command]) =>
        String(command).includes('--version'),
      ),
    ).toHaveLength(1);
  });
});
