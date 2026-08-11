import path from 'path';
import { rgPath as rawRgPath } from '@vscode/ripgrep';

/**
 * Resolve the executable path exposed by @vscode/ripgrep. Packaged Electron
 * apps cannot spawn binaries from inside app.asar, so use the unpacked copy.
 */
export const getRgPath = (): string => {
  if (!rawRgPath) return rawRgPath;
  if (
    rawRgPath.includes('app.asar') &&
    !rawRgPath.includes('app.asar.unpacked')
  ) {
    return rawRgPath.replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`,
    );
  }
  return rawRgPath;
};
