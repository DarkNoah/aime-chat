import fs from 'fs';
import path from 'path';
import {
  isPythonRuntimeVersionCompatible,
  PYTHON_RUNTIME_VERSION,
} from '../utils/pythonRuntimeVersion';

type CommandResult = {
  code: number | null;
  stdout?: string;
  stderr?: string;
};

type RuntimeCommandRunner = (
  command: string,
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeout: number;
  },
) => Promise<CommandResult>;

export interface ManagedPythonRuntimeInfo {
  installed: boolean;
  dir?: string;
  pythonPath?: string;
  pipPath?: string;
  pythonVersion?: string;
  pipVersion?: string;
}

interface ManagedPythonRuntimeOptions {
  uvDir: string;
  userDataDir: string;
  packageCacheDir: string;
  packageIndex: string;
  commandEnv: Record<string, string>;
  isWindows: boolean;
  isOnline: () => boolean;
  runCommand: RuntimeCommandRunner;
}

function getPaths(userDataDir: string, isWindows: boolean) {
  const dir = path.join(userDataDir, '.runtime', 'python-runtime');
  const venvDir = path.join(dir, '.venv');
  return {
    dir,
    venvDir,
    pythonPath: isWindows
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python'),
    pipPath: isWindows
      ? path.join(venvDir, 'Scripts', 'pip.exe')
      : path.join(venvDir, 'bin', 'pip'),
  };
}

export async function inspectManagedPythonRuntime(
  userDataDir: string,
  isWindows: boolean,
  runCommand: RuntimeCommandRunner,
): Promise<ManagedPythonRuntimeInfo> {
  const paths = getPaths(userDataDir, isWindows);
  const info: ManagedPythonRuntimeInfo = { installed: false };

  if (!fs.existsSync(paths.pythonPath)) return info;

  info.dir = paths.dir;
  info.pythonPath = paths.pythonPath;
  if (fs.existsSync(paths.pipPath)) info.pipPath = paths.pipPath;

  const result = await runCommand(`"${paths.pythonPath}" --version`, {
    cwd: paths.dir,
    timeout: 1000 * 10,
  });
  if (result.code === 0) {
    const pythonLine = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('Python '));
    info.pythonVersion = pythonLine?.replace(/^Python\s+/, '');
    info.installed = isPythonRuntimeVersionCompatible(info.pythonVersion);
  }

  if (info.pipPath) {
    const pipResult = await runCommand(`"${info.pipPath}" --version`, {
      cwd: paths.dir,
      timeout: 1000 * 10,
    });
    if (pipResult.code === 0) {
      const pipLine = `${pipResult.stdout ?? ''}\n${pipResult.stderr ?? ''}`
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('pip '));
      info.pipVersion = pipLine?.split(' ')[1];
    }
  }

  return info;
}

export async function setupManagedPythonRuntime(
  options: ManagedPythonRuntimeOptions,
) {
  const paths = getPaths(options.userDataDir, options.isWindows);
  const uvPath = path.join(
    options.uvDir,
    options.isWindows ? 'uv.exe' : './uv',
  );
  await fs.promises.mkdir(options.packageCacheDir, { recursive: true });

  const installPip = async () => {
    if (fs.existsSync(paths.pipPath)) return;

    const installCommand = (offline: boolean) =>
      [
        `"${uvPath}" pip install pip setuptools wheel`,
        `--python "${paths.pythonPath}"`,
        `--cache-dir "${options.packageCacheDir}"`,
        `--default-index ${options.packageIndex}`,
        ...(offline ? ['--offline'] : []),
      ].join(' ');
    let result = await options.runCommand(installCommand(true), {
      cwd: paths.dir,
      env: options.commandEnv,
      timeout: 1000 * 60,
    });
    if (result.code !== 0 && options.isOnline()) {
      result = await options.runCommand(installCommand(false), {
        cwd: paths.dir,
        env: options.commandEnv,
        timeout: 1000 * 60,
      });
    }
  };

  if (fs.existsSync(paths.pythonPath)) {
    const existingRuntime = await inspectManagedPythonRuntime(
      options.userDataDir,
      options.isWindows,
      options.runCommand,
    );
    if (existingRuntime.installed) {
      await installPip();
      return true;
    }
  }

  fs.mkdirSync(paths.dir, { recursive: true });
  if (fs.existsSync(paths.venvDir)) {
    await fs.promises.rm(paths.venvDir, { recursive: true, force: true });
  }

  const createCommand = (offline: boolean) =>
    [
      `"${uvPath}" venv "${paths.venvDir}" --clear`,
      `--python "${PYTHON_RUNTIME_VERSION}"`,
      `--cache-dir "${options.packageCacheDir}"`,
      `--default-index ${options.packageIndex}`,
      ...(offline ? ['--offline'] : []),
    ].join(' ');
  let result = await options.runCommand(createCommand(true), {
    cwd: options.uvDir,
    env: options.commandEnv,
    timeout: 1000 * 60,
  });
  if (result.code !== 0 && options.isOnline()) {
    result = await options.runCommand(createCommand(false), {
      cwd: options.uvDir,
      env: options.commandEnv,
      timeout: 1000 * 60,
    });
  }
  if (result.code !== 0 || !fs.existsSync(paths.pythonPath)) return false;

  await installPip();
  const runtimeInfo = await inspectManagedPythonRuntime(
    options.userDataDir,
    options.isWindows,
    options.runCommand,
  );
  return runtimeInfo.installed;
}

let setupPromise: Promise<boolean> | undefined;

export function ensureManagedPythonRuntime(
  options: ManagedPythonRuntimeOptions,
) {
  if (!setupPromise) {
    setupPromise = setupManagedPythonRuntime(options).finally(() => {
      setupPromise = undefined;
    });
  }

  return setupPromise;
}
