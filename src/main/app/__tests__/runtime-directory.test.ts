/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getDefaultRuntimeDirectory,
  getRuntimeDirectory,
  getRuntimeEnvironment,
  initializeRuntimeDirectory,
  normalizeRuntimeDirectory,
  resolveDefaultRuntimeDirectory,
  validateRuntimeDirectory,
} from '../runtime-directory';

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected app path: ${name}`);
      return '/test/user-data';
    },
  },
}));

it.each([
  [
    'win32',
    'C:\\Users\\Noah\\AppData\\Roaming\\aime-chat',
    'C:\\Users\\Noah\\AppData\\Roaming\\aime-chat\\.runtime',
  ],
  [
    'darwin',
    '/Users/noah/Library/Application Support/aime-chat',
    '/Users/noah/Library/Application Support/aime-chat/.runtime',
  ],
  [
    'linux',
    '/home/noah/.config/aime-chat',
    '/home/noah/.config/aime-chat/.runtime',
  ],
] as const)(
  'defaults to .runtime inside the application data directory on %s',
  (platform, userDataPath, expected) => {
    expect(
      resolveDefaultRuntimeDirectory({
        platform,
        userDataPath,
      }),
    ).toBe(expected);
  },
);

it('gets the default from Electron userData without using the installation location', () => {
  expect(getDefaultRuntimeDirectory()).toBe('/test/user-data/.runtime');
});

it('restores a saved directory and keeps Python downloads and caches in it', () => {
  initializeRuntimeDirectory('/custom/运行 环境');
  expect(getRuntimeDirectory()).toBe('/custom/运行 环境');
  expect(getRuntimeEnvironment()).toEqual({
    UV_PYTHON_INSTALL_DIR: '/custom/运行 环境/python',
    UV_CACHE_DIR: '/custom/运行 环境/code-execution/uv-cache',
  });
});

it('keeps an existing legacy installation without relocating its Python store', () => {
  initializeRuntimeDirectory();
  expect(getRuntimeDirectory()).toBe('/test/user-data/.runtime');
  expect(getRuntimeEnvironment()).toEqual({});
});

it('uses the requested default for a new installation', () => {
  expect(initializeRuntimeDirectory()).toBe(getDefaultRuntimeDirectory());
});

it.each([
  '',
  'relative/path',
  '/',
  '/tmp/a"b',
  '/tmp/$(command)',
  '/tmp/`command`',
  '/tmp/%USER%',
  '/tmp/line\nbreak',
])('rejects invalid or shell-expanding paths: %p', (directory) => {
  expect(() => normalizeRuntimeDirectory(directory)).toThrow(
    'RUNTIME_DIRECTORY_INVALID',
  );
});

it('creates and verifies a directory containing spaces and Chinese characters without leaving probe files', async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'aime-runtime-test-'),
  );
  try {
    const directory = path.join(root, '运行 环境');
    await expect(validateRuntimeDirectory(directory)).resolves.toBe(directory);
    expect(await fs.promises.readdir(directory)).toEqual([]);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

it('reports unwritable directories before starting installation', async () => {
  const mkdir = jest
    .spyOn(fs.promises, 'mkdir')
    .mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
  try {
    await expect(
      validateRuntimeDirectory('/protected/runtime'),
    ).rejects.toThrow('RUNTIME_DIRECTORY_NOT_WRITABLE');
  } finally {
    mkdir.mockRestore();
  }
});
