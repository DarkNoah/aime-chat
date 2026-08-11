import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BrowserExecutableOption, BrowserType } from '@/types/instance';

const SUPPORTED_BROWSERS: ReadonlyArray<{
  browser: BrowserType;
  label: string;
}> = [
  { browser: 'chrome', label: 'Google Chrome' },
  { browser: 'edge', label: 'Microsoft Edge' },
  { browser: 'chromium', label: 'Chromium' },
];

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function resolveInstalledExecutablePath(
  executablePath?: string | null,
  searchPath: string | undefined = process.env.PATH,
): string | undefined {
  if (!executablePath) return undefined;

  const containsPathSeparator =
    executablePath.includes('/') || executablePath.includes('\\');
  if (path.isAbsolute(executablePath) || containsPathSeparator) {
    const resolvedPath = path.resolve(executablePath);
    return isFile(resolvedPath) ? resolvedPath : undefined;
  }

  if (!searchPath) return undefined;

  for (const directory of searchPath.split(path.delimiter).filter(Boolean)) {
    const resolvedPath = path.join(directory, executablePath);
    if (isFile(resolvedPath)) return resolvedPath;
  }

  return undefined;
}

export function createBrowserExecutableOptions(
  executablePaths: Partial<Record<BrowserType, string>>,
): BrowserExecutableOption[] {
  return SUPPORTED_BROWSERS.map(({ browser, label }) => {
    const executablePath = executablePaths[browser];
    return {
      browser,
      label,
      executablePath,
      installed: Boolean(executablePath),
    };
  });
}

export function getDefaultBrowserOption(
  availableBrowsers: BrowserExecutableOption[],
): BrowserExecutableOption | undefined {
  return availableBrowsers.find((browser) => browser.installed);
}

export function getBrowserUserDataPaths(
  platform: string = process.platform,
  homeDirectory: string = os.homedir(),
  environment: Record<string, string | undefined> = process.env,
): Partial<Record<BrowserType, string>> {
  if (platform === 'win32') {
    const localAppData = environment.LOCALAPPDATA;
    if (!localAppData) return {};

    return {
      chrome: path.win32.join(localAppData, 'Google', 'Chrome', 'User Data'),
      edge: path.win32.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
      chromium: path.win32.join(localAppData, 'Chromium', 'User Data'),
    };
  }

  if (platform === 'darwin') {
    const applicationSupport = path.posix.join(
      homeDirectory,
      'Library',
      'Application Support',
    );
    return {
      chrome: path.posix.join(applicationSupport, 'Google', 'Chrome'),
      edge: path.posix.join(applicationSupport, 'Microsoft Edge'),
      chromium: path.posix.join(applicationSupport, 'Chromium'),
    };
  }

  if (platform === 'linux') {
    const xdgConfigHome =
      environment.XDG_CONFIG_HOME || path.posix.join(homeDirectory, '.config');
    const chromeConfigHome = environment.CHROME_CONFIG_HOME || xdgConfigHome;
    return {
      chrome: path.posix.join(chromeConfigHome, 'google-chrome'),
      edge: path.posix.join(xdgConfigHome, 'microsoft-edge'),
      chromium: path.posix.join(chromeConfigHome, 'chromium'),
    };
  }

  return {};
}
