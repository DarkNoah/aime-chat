/* eslint-disable import/first */
import fs from 'fs';
import path from 'path';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/Users/test/Library/Application Support/aime-chat'),
  },
  net: {
    isOnline: jest.fn(() => true),
  },
}));

import {
  CODE_EXECUTION_PACKAGE_INDEX,
  CODE_EXECUTION_PACKAGE_GROUPS,
  COMMON_CODE_EXECUTION_PACKAGES,
  getCodeExecutionPackageCachePaths,
  getCodeExecutionPackageIndexOptions,
  warmCodeExecutionPackageCache,
  withCodeExecutionPackageCache,
} from './python-package-cache';
import { net } from 'electron';

describe('CodeExecution Python package cache', () => {
  it('uses a persistent cache under the application runtime directory', () => {
    const paths = getCodeExecutionPackageCachePaths();

    expect(paths.uvCache).toBe(
      path.join(
        '/Users/test/Library/Application Support/aime-chat',
        '.runtime',
        'code-execution',
        'uv-cache',
      ),
    );
    expect(withCodeExecutionPackageCache({ CUSTOM_ENV: 'yes' })).toEqual({
      CUSTOM_ENV: 'yes',
      UV_CACHE_DIR: paths.uvCache,
    });
  });

  it('keeps the configured index when using the cache offline', () => {
    expect(getCodeExecutionPackageIndexOptions(false)).toBe(
      `--default-index ${CODE_EXECUTION_PACKAGE_INDEX}`,
    );
    expect(getCodeExecutionPackageIndexOptions(true)).toBe(
      `--default-index ${CODE_EXECUTION_PACKAGE_INDEX} --offline`,
    );
  });

  it('preloads office, data-processing, and productivity packages', () => {
    expect(CODE_EXECUTION_PACKAGE_GROUPS.runtime).toEqual(
      expect.arrayContaining(['pip', 'setuptools', 'wheel', 'mcp']),
    );
    expect(CODE_EXECUTION_PACKAGE_GROUPS.office).toEqual(
      expect.arrayContaining([
        'openpyxl',
        'python-docx',
        'python-pptx',
        'pypdf',
        'reportlab',
      ]),
    );
    expect(CODE_EXECUTION_PACKAGE_GROUPS.data).toEqual(
      expect.arrayContaining([
        'numpy',
        'pandas',
        'scipy',
        'scikit-learn',
        'pyarrow',
        'duckdb',
      ]),
    );
    expect(CODE_EXECUTION_PACKAGE_GROUPS.productivity).toEqual(
      expect.arrayContaining([
        'requests',
        'beautifulsoup4',
        'pillow',
        'pyyaml',
        'jieba',
      ]),
    );
    expect(COMMON_CODE_EXECUTION_PACKAGES).toEqual(
      expect.arrayContaining([
        'mcp',
        'openpyxl',
        'python-docx',
        'numpy',
        'pyarrow',
        'rapidfuzz',
      ]),
    );
  });

  it('installs cached packages into the application runtime while offline', async () => {
    const mkdirSpy = jest
      .spyOn(fs.promises, 'mkdir')
      .mockResolvedValue(undefined);
    (net.isOnline as jest.Mock).mockReturnValueOnce(false);
    const runCommand = jest.fn().mockResolvedValue({ code: 0 });

    await expect(
      warmCodeExecutionPackageCache(
        {
          status: 'installed',
          installed: true,
          path: '/runtime/uv',
          pythonRuntime: {
            installed: true,
            pythonPath: '/runtime/python-runtime/.venv/bin/python',
          },
        },
        {
          runCommand,
          log: jest.fn(),
        },
      ),
    ).resolves.toBe(true);
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0][0]).toContain('--offline');
    mkdirSpy.mockRestore();
  });

  it('warms the persistent application Python environment when available', async () => {
    const mkdirSpy = jest
      .spyOn(fs.promises, 'mkdir')
      .mockResolvedValue(undefined);
    const runCommand = jest.fn().mockResolvedValue({ code: 0 });
    const pythonPath = '/runtime/python-runtime/.venv/bin/python';

    await expect(
      warmCodeExecutionPackageCache(
        {
          status: 'installed',
          installed: true,
          path: '/runtime/uv',
          pythonRuntime: {
            installed: true,
            pythonPath,
          },
        },
        {
          runCommand,
          log: jest.fn(),
        },
      ),
    ).resolves.toBe(true);

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0][0]).toContain(`--python "${pythonPath}"`);
    expect(runCommand.mock.calls[0][0]).toContain('--offline');
    mkdirSpy.mockRestore();
  });

  it('downloads missing packages only after the offline cache misses', async () => {
    const mkdirSpy = jest
      .spyOn(fs.promises, 'mkdir')
      .mockResolvedValue(undefined);
    const runCommand = jest
      .fn()
      .mockResolvedValueOnce({ code: 1, stderr: 'not cached' })
      .mockResolvedValueOnce({ code: 0 });

    await expect(
      warmCodeExecutionPackageCache(
        {
          status: 'installed',
          installed: true,
          path: '/runtime/uv',
          pythonRuntime: {
            installed: true,
            pythonPath: '/runtime/python-runtime/.venv/bin/python',
          },
        },
        {
          runCommand,
          log: jest.fn(),
        },
      ),
    ).resolves.toBe(true);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls[0][0]).toContain('--offline');
    expect(runCommand.mock.calls[1][0]).not.toContain('--offline');
    mkdirSpy.mockRestore();
  });
});
