/* eslint-disable import/first */
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

  it('waits for connectivity before starting a background download', async () => {
    (net.isOnline as jest.Mock).mockReturnValueOnce(false);
    const runCommand = jest.fn();

    await expect(
      warmCodeExecutionPackageCache(
        {
          status: 'installed',
          installed: true,
          path: '/runtime/uv',
        },
        {
          runCommand,
          log: jest.fn(),
        },
      ),
    ).resolves.toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
