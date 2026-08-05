import path from 'path';
import { net } from 'electron';
import {
  ensurePythonRuntimeEnvironment,
  getBunRuntime,
  getUVRuntime,
} from '../app/runtime';
import { runCommand } from '@/main/utils/shell';
import {
  CODE_EXECUTION_PACKAGE_INDEX,
  withCodeExecutionPackageCache,
} from '@/main/tools/code/python-package-cache';

const PATH_DELIMITER = process.platform === 'win32' ? ';' : ':';

export let hasSystemPython = undefined;

export type PythonRuntimeMode = 'auto' | 'independent' | 'system';

function prependPath(env: Record<string, string>, dir?: string) {
  if (!dir) return;
  const paths = (env.PATH ?? '').split(PATH_DELIMITER).filter(Boolean);
  env.PATH = [dir, ...paths.filter((item) => item !== dir)].join(
    PATH_DELIMITER,
  );
  if ((env.PATH ?? '').length > 0) {
    env.PATH += PATH_DELIMITER;
  }
}

function useSystemPython(env: Record<string, string>) {
  return {
    ...env,
    VIRTUAL_ENV: '',
    UV_PROJECT_ENVIRONMENT: '',
  };
}

async function hasUsableSystemPython() {
  const versionResult = await runCommand('python --version', {
    timeout: 1000 * 5,
  });
  const versionOutput = `${versionResult.stdout}\n${versionResult.stderr}`;

  if (
    versionResult.code !== 0 ||
    !/^Python\s+\d+(\.\d+)+/m.test(versionOutput)
  ) {
    return false;
  }

  if (process.platform !== 'win32') {
    return true;
  }

  const whereResult = await runCommand('where python', {
    timeout: 1000 * 5,
  });
  if (whereResult.code !== 0) {
    return false;
  }

  const candidates = whereResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\//g, '\\').toLowerCase())
    .filter((line) => !line.includes('\\windowsapps\\python.exe'));

  return candidates.length > 0;
}
export const getRuntimePython = async (
  env: Record<string, string> = {},
  mode: PythonRuntimeMode = 'auto',
): Promise<Record<string, string>> => {
  let uv = await getUVRuntime();
  const bun = await getBunRuntime();
  let runtimeEnv = { ...env };

  if (uv?.installed || bun?.installed) {
    prependPath(runtimeEnv, uv?.dir || bun?.dir);
  }

  if (mode === 'independent') {
    if (!uv?.installed || !uv.dir) {
      uv = await getUVRuntime(true);
    }
    if (!uv?.installed || !uv.dir) {
      return useSystemPython(runtimeEnv);
    }
    prependPath(runtimeEnv, uv.dir);

    if (!uv.pythonRuntime?.installed || !uv.pythonRuntime.pythonPath) {
      let ready = false;
      try {
        ready = await ensurePythonRuntimeEnvironment(uv.dir);
      } catch {
        return useSystemPython(runtimeEnv);
      }
      if (!ready) {
        return useSystemPython(runtimeEnv);
      }
      uv = await getUVRuntime(true);
    }

    const pythonPath = uv?.pythonRuntime?.pythonPath;
    if (!pythonPath) {
      return useSystemPython(runtimeEnv);
    }

    const venvDir = path.dirname(path.dirname(pythonPath));
    runtimeEnv = withCodeExecutionPackageCache(runtimeEnv);
    runtimeEnv.VIRTUAL_ENV = venvDir;
    runtimeEnv.UV_PROJECT_ENVIRONMENT = venvDir;
    runtimeEnv.UV_DEFAULT_INDEX = CODE_EXECUTION_PACKAGE_INDEX;
    runtimeEnv.PIP_INDEX_URL = CODE_EXECUTION_PACKAGE_INDEX;
    if (!net.isOnline()) {
      runtimeEnv.UV_OFFLINE = '1';
    }
    prependPath(runtimeEnv, path.dirname(pythonPath));
    return runtimeEnv;
  }

  if (mode === 'system') {
    return useSystemPython(runtimeEnv);
  }

  const _hasSystemPython = hasSystemPython !== undefined ? hasSystemPython : await hasUsableSystemPython();
  hasSystemPython = _hasSystemPython;
  const runtimePythonBinDir = uv?.pythonRuntime?.pythonPath
    ? path.dirname(uv.pythonRuntime.pythonPath)
    : undefined;

  if (!hasSystemPython && runtimePythonBinDir) {
    prependPath(runtimeEnv, runtimePythonBinDir);
  }
  return runtimeEnv;
};
