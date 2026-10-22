import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let runtimeDirectory: string | undefined;

export function resolveDefaultRuntimeDirectory(options: {
  platform: typeof process.platform;
  userDataPath: string;
}) {
  const paths = options.platform === 'win32' ? path.win32 : path.posix;
  return paths.join(options.userDataPath, '.runtime');
}

export function getDefaultRuntimeDirectory() {
  return resolveDefaultRuntimeDirectory({
    platform: process.platform,
    userDataPath: app.getPath('userData'),
  });
}

export function getRuntimeDirectory() {
  return runtimeDirectory ?? getDefaultRuntimeDirectory();
}

export function initializeRuntimeDirectory(savedPath?: string) {
  runtimeDirectory = savedPath || getDefaultRuntimeDirectory();
  return runtimeDirectory;
}

export function setRuntimeDirectory(directory: string) {
  runtimeDirectory = directory;
}

export function hasManagedRuntime(directory = getRuntimeDirectory()) {
  return [
    'bin/uv',
    'bin/uv.exe',
    'bin/bun',
    'bin/bun.exe',
    'python-runtime',
    'paddleocr-runtime',
    'qwen-audio-runtime',
    'agent-browser',
    'python',
    'code-execution',
  ].some((entry) => fs.existsSync(path.join(directory, entry)));
}

export function normalizeRuntimeDirectory(value: unknown): string {
  // Installers invoke shells on all platforms. Reject expansion characters
  // before a user-supplied directory can become part of an install command.
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    !path.isAbsolute(value.trim()) ||
    /["`$%]/.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  ) {
    throw new Error('RUNTIME_DIRECTORY_INVALID');
  }
  const directory = path.resolve(value.trim());
  if (directory === path.parse(directory).root) {
    throw new Error('RUNTIME_DIRECTORY_INVALID');
  }
  return directory;
}

export async function validateRuntimeDirectory(value: unknown) {
  const directory = normalizeRuntimeDirectory(value);
  try {
    await fs.promises.mkdir(directory, { recursive: true });
    const probe = await fs.promises.mkdtemp(
      path.join(directory, '.aime-write-'),
    );
    await fs.promises.rmdir(probe);
  } catch {
    throw new Error('RUNTIME_DIRECTORY_NOT_WRITABLE');
  }
  return directory;
}

export function getRuntimeEnvironment(): Record<string, string> {
  // Existing installations in userData/.runtime may still reference uv's
  // original Python store.
  if (getRuntimeDirectory() === getDefaultRuntimeDirectory()) return {};
  return {
    UV_PYTHON_INSTALL_DIR: path.join(getRuntimeDirectory(), 'python'),
    UV_CACHE_DIR: path.join(
      getRuntimeDirectory(),
      'code-execution',
      'uv-cache',
    ),
  };
}
