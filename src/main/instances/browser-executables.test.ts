import path from 'path';
import {
  createBrowserExecutableOptions,
  getBrowserUserDataPaths,
  getDefaultBrowserOption,
  resolveInstalledExecutablePath,
} from './browser-executables';

describe('browser executable discovery', () => {
  it('keeps existing browser priority and exposes Chromium', () => {
    const options = createBrowserExecutableOptions({
      chrome: '/browsers/chrome',
      edge: '/browsers/edge',
      chromium: '/browsers/chromium',
    });

    expect(options.map((option) => option.browser)).toEqual([
      'chrome',
      'edge',
      'chromium',
    ]);
    expect(options[2]).toEqual({
      browser: 'chromium',
      label: 'Chromium',
      executablePath: '/browsers/chromium',
      installed: true,
    });
    expect(getDefaultBrowserOption(options)?.browser).toBe('chrome');
  });

  it('uses Chromium as the default fallback when it is the only installed browser', () => {
    const options = createBrowserExecutableOptions({
      chromium: '/browsers/chromium',
    });

    expect(getDefaultBrowserOption(options)).toMatchObject({
      browser: 'chromium',
      executablePath: '/browsers/chromium',
    });
  });

  it('resolves executable names from PATH to an absolute path', () => {
    expect(
      resolveInstalledExecutablePath(
        path.basename(process.execPath),
        path.dirname(process.execPath),
      ),
    ).toBe(process.execPath);
  });

  it('rejects missing executable paths', () => {
    expect(
      resolveInstalledExecutablePath(
        'aime-chat-browser-that-does-not-exist',
        path.dirname(process.execPath),
      ),
    ).toBeUndefined();
  });

  it('returns Windows browser profile paths', () => {
    expect(
      getBrowserUserDataPaths('win32', 'C:\\Users\\test', {
        LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
      }),
    ).toEqual({
      chrome: 'C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\User Data',
      edge: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\Edge\\User Data',
      chromium: 'C:\\Users\\test\\AppData\\Local\\Chromium\\User Data',
    });
  });

  it('returns macOS browser profile paths', () => {
    expect(getBrowserUserDataPaths('darwin', '/Users/test', {})).toEqual({
      chrome: '/Users/test/Library/Application Support/Google/Chrome',
      edge: '/Users/test/Library/Application Support/Microsoft Edge',
      chromium: '/Users/test/Library/Application Support/Chromium',
    });
  });

  it('respects Linux Chromium and XDG config roots', () => {
    expect(
      getBrowserUserDataPaths('linux', '/home/test', {
        CHROME_CONFIG_HOME: '/chrome-config',
        XDG_CONFIG_HOME: '/xdg-config',
      }),
    ).toEqual({
      chrome: '/chrome-config/google-chrome',
      edge: '/xdg-config/microsoft-edge',
      chromium: '/chrome-config/chromium',
    });
  });
});
