const mockCrashReporterStart = jest.fn();
const mockGetPath = jest.fn((name: string) => {
  if (name === 'crashDumps') return '/tmp/aime-chat-crashes';
  return `/tmp/${name}`;
});
const mockAppOn = jest.fn();
const mockAppLogWrite = jest.fn();

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => mockGetPath(name),
    on: (...args: unknown[]) => mockAppOn(...args),
  },
  crashReporter: {
    start: (...args: unknown[]) => mockCrashReporterStart(...args),
  },
}));

jest.mock('../logger', () => ({
  appLog: {
    write: (...args: unknown[]) => mockAppLogWrite(...args),
  },
}));

describe('crash reporter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('starts Electron crash reporting for local dump files without uploading', async () => {
    const { getCrashDumpDirectory, initCrashReporter } = await import(
      '../crash-reporter'
    );

    initCrashReporter();

    expect(mockCrashReporterStart).toHaveBeenCalledTimes(1);
    const options = mockCrashReporterStart.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(options.uploadToServer).toBe(false);
    expect(options).not.toHaveProperty('submitURL');
    expect(getCrashDumpDirectory()).toBe('/tmp/aime-chat-crashes');
    expect(mockAppLogWrite).toHaveBeenCalledWith(
      'info',
      '[crash-reporter] initialized',
      { dumpDirectory: '/tmp/aime-chat-crashes' },
    );
  });

  it('does not start or register listeners more than once', async () => {
    const { initCrashReporter } = await import('../crash-reporter');

    initCrashReporter();
    initCrashReporter();

    expect(mockCrashReporterStart).toHaveBeenCalledTimes(1);
    expect(mockAppOn).toHaveBeenCalledTimes(2);
  });

  it('logs process crash events with the dump directory', async () => {
    const { initCrashReporter } = await import('../crash-reporter');

    initCrashReporter();

    const renderProcessGoneHandler = mockAppOn.mock.calls.find(
      ([eventName]) => eventName === 'render-process-gone',
    )?.[1] as Function;
    const childProcessGoneHandler = mockAppOn.mock.calls.find(
      ([eventName]) => eventName === 'child-process-gone',
    )?.[1] as Function;

    renderProcessGoneHandler({}, {}, { reason: 'crashed', exitCode: 1 });
    childProcessGoneHandler(
      {},
      { type: 'Utility', reason: 'crashed', exitCode: 2 },
    );

    expect(mockAppLogWrite).toHaveBeenCalledWith(
      'error',
      '[crash-reporter] render process gone',
      {
        dumpDirectory: '/tmp/aime-chat-crashes',
        reason: 'crashed',
        exitCode: 1,
      },
    );
    expect(mockAppLogWrite).toHaveBeenCalledWith(
      'error',
      '[crash-reporter] child process gone',
      {
        dumpDirectory: '/tmp/aime-chat-crashes',
        type: 'Utility',
        reason: 'crashed',
        exitCode: 2,
      },
    );
  });
});
