import path from 'path';

const mkdirSyncMock = jest.fn();
const getPathMock = jest.fn((name: string) => {
  if (name === 'logs') return '/tmp/aime-chat-logs';
  if (name === 'userData') return '/tmp/aime-chat-user-data';
  return `/tmp/${name}`;
});

jest.mock('fs', () => ({
  mkdirSync: (...args: unknown[]) => mkdirSyncMock(...args),
}));

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => getPathMock(name),
  },
}));

jest.mock('electron-log', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(),
    transports: {
      file: {
        level: undefined,
        maxSize: undefined,
        resolvePathFn: undefined,
        getFile: jest.fn(() => ({
          path: path.join('/tmp/aime-chat-logs', 'main.log'),
        })),
      },
      console: {
        level: undefined,
      },
    },
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('app logger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('keeps the app log file inside the Electron logs directory', async () => {
    const { getLogDirectory, getLogFilePath } = await import('../logger');

    expect(getLogDirectory()).toBe('/tmp/aime-chat-logs');
    expect(getLogFilePath()).toBe(path.join('/tmp/aime-chat-logs', 'main.log'));
    expect(mkdirSyncMock).toHaveBeenCalledWith('/tmp/aime-chat-logs', {
      recursive: true,
    });
  });

  it('writes a single structured log line and trims long text values', async () => {
    const log = (await import('electron-log')).default;
    const { appLog } = await import('../logger');

    appLog.write('error', '[runtime] install failed', {
      pkg: 'uv',
      status: 'not_installed',
      message: 'curl failed',
      stdout: 'download output',
      stderr: 'network error',
      code: 7,
    });

    expect(log.error).toHaveBeenCalledWith(
      '[runtime] install failed',
      expect.objectContaining({
        pkg: 'uv',
        status: 'not_installed',
        message: 'curl failed',
        stdout: 'download output',
        stderr: 'network error',
        code: 7,
      }),
    );
  });
});
