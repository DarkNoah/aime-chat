import path from "path";
import { getBunRuntime, getUVRuntime } from "../app/runtime";
import {
  attachAbortHandler,
  createManagedAbortController,
  createShell,
  decodeBuffer,
  runCommand,
} from '@/main/utils/shell';

const PATH_DELIMITER = process.platform === 'win32' ? ';' : ':';

export let hasSystemPython = undefined;

function prependPath(env: Record<string, string>, dir?: string) {
  if (!dir) return;
  env['PATH'] += `${dir}${PATH_DELIMITER}`;
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


export const getRuntimePython = async (env: Record<string, string> = {}): Promise<Record<string, string>> => {
  const uv = await getUVRuntime();
  const bun = await getBunRuntime();
  const _env = { ...env };

  if (uv?.installed || bun?.installed) {
    prependPath(_env, uv.dir || bun.dir);
  }

  const _hasSystemPython = hasSystemPython !== undefined ? hasSystemPython : await hasUsableSystemPython();
  hasSystemPython = _hasSystemPython;
  const runtimePythonBinDir = uv.pythonRuntime?.pythonPath
    ? path.dirname(uv.pythonRuntime.pythonPath)
    : undefined;

  if (!hasSystemPython && runtimePythonBinDir) {
    prependPath(_env, runtimePythonBinDir);
  }
  return _env;
};
