/* eslint-disable import/first */
import path from 'path';

jest.mock('electron', () => ({
  net: {
    isOnline: jest.fn(() => true),
  },
  app: {
    getPath: jest.fn(() => '/runtime/user-data'),
  },
}));

jest.mock('../app/runtime', () => ({
  ensurePythonRuntimeEnvironment: jest.fn(),
  getBunRuntime: jest.fn(),
  getUVRuntime: jest.fn(),
}));

jest.mock('@/main/utils/shell', () => ({
  runCommand: jest.fn(),
}));

import { net } from 'electron';
import {
  ensurePythonRuntimeEnvironment,
  getBunRuntime,
  getUVRuntime,
} from '../app/runtime';
import { getCodeExecutionPackageCachePaths } from '@/main/tools/code/python-package-cache';
import { getRuntimePython } from './runtimePython';

const mockedGetUVRuntime = getUVRuntime as jest.Mock;
const mockedGetBunRuntime = getBunRuntime as jest.Mock;
const mockedEnsurePythonRuntimeEnvironment =
  ensurePythonRuntimeEnvironment as jest.Mock;

describe('getRuntimePython', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (net.isOnline as jest.Mock).mockReturnValue(true);
    mockedGetBunRuntime.mockResolvedValue({ installed: false });
  });

  it('uses the persistent independent environment by default for Bash mode', async () => {
    const pythonPath = '/runtime/python-runtime/.venv/bin/python';
    mockedGetUVRuntime.mockResolvedValue({
      installed: true,
      dir: '/runtime/bin',
      pythonRuntime: {
        installed: true,
        pythonPath,
      },
    });

    const env = await getRuntimePython({ PATH: '/system/bin' }, 'independent');
    const venvDir = path.dirname(path.dirname(pythonPath));

    expect(env.PATH).toBe(
      `${path.dirname(pythonPath)}:${'/runtime/bin'}:/system/bin:`,
    );
    expect(env.VIRTUAL_ENV).toBe(venvDir);
    expect(env.UV_PROJECT_ENVIRONMENT).toBe(venvDir);
    expect(env.UV_CACHE_DIR).toBe(
      getCodeExecutionPackageCachePaths().uvCache,
    );
    expect(mockedEnsurePythonRuntimeEnvironment).not.toHaveBeenCalled();
  });

  it('creates a missing independent environment before using it', async () => {
    const pythonPath = '/runtime/python-runtime/.venv/bin/python';
    mockedGetUVRuntime
      .mockResolvedValueOnce({
        installed: true,
        dir: '/runtime/bin',
        pythonRuntime: { installed: false },
      })
      .mockResolvedValueOnce({
        installed: true,
        dir: '/runtime/bin',
        pythonRuntime: {
          installed: true,
          pythonPath,
        },
      });
    mockedEnsurePythonRuntimeEnvironment.mockResolvedValue(true);

    const env = await getRuntimePython({ PATH: '' }, 'independent');

    expect(mockedEnsurePythonRuntimeEnvironment).toHaveBeenCalledWith(
      '/runtime/bin',
    );
    expect(env.PATH).toBe(`${path.dirname(pythonPath)}:/runtime/bin:`);
  });

  it('falls back to system Python when the independent runtime cannot be installed', async () => {
    mockedGetUVRuntime.mockResolvedValue({
      installed: true,
      dir: '/runtime/bin',
      pythonRuntime: { installed: false },
    });
    mockedEnsurePythonRuntimeEnvironment.mockResolvedValue(false);

    const env = await getRuntimePython({ PATH: '/system/bin' }, 'independent');

    expect(mockedEnsurePythonRuntimeEnvironment).toHaveBeenCalledWith(
      '/runtime/bin',
    );
    expect(env.PATH).toBe('/runtime/bin:/system/bin:');
    expect(env.VIRTUAL_ENV).toBe('');
    expect(env.UV_CACHE_DIR).toBeUndefined();
  });

  it('keeps system Python selected when configured', async () => {
    mockedGetUVRuntime.mockResolvedValue({
      installed: true,
      dir: '/runtime/bin',
      pythonRuntime: {
        installed: true,
        pythonPath: '/runtime/python-runtime/.venv/bin/python',
      },
    });

    const env = await getRuntimePython({ PATH: '/system/bin' }, 'system');

    expect(env.PATH).toBe('/runtime/bin:/system/bin:');
    expect(env.VIRTUAL_ENV).toBe('');
    expect(env.UV_CACHE_DIR).toBeUndefined();
  });

  it('forces uv to use its cached packages while offline', async () => {
    (net.isOnline as jest.Mock).mockReturnValue(false);
    mockedGetUVRuntime.mockResolvedValue({
      installed: true,
      dir: '/runtime/bin',
      pythonRuntime: {
        installed: true,
        pythonPath: '/runtime/python-runtime/.venv/bin/python',
      },
    });

    const env = await getRuntimePython({ PATH: '' }, 'independent');

    expect(env.UV_OFFLINE).toBe('1');
  });
});
