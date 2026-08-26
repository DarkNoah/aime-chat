import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  ThemeBackgroundLocks,
  ThemeBackgroundTarget,
  ThemeConfig,
} from '@/types/app';
import { getAssetPath } from '../utils';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
]);

const reportedInvalidPaths = new Set<string>();

const reportOnce = (variable: string, value: string, reason: string) => {
  const key = `${variable}:${value}`;
  if (reportedInvalidPaths.has(key)) {
    return;
  }
  reportedInvalidPaths.add(key);
  console.warn(`Ignoring ${variable}="${value}": ${reason}`);
};

const isPathWithinDirectory = (candidate: string, directory: string) => {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(candidate),
  );
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
};

/**
 * Turn a path relative to the bundled `assets` directory into a `file:` URL the
 * renderer can load. Traversal outside of `assets` is rejected, including via
 * symlinks, so a misconfigured deployment cannot expose arbitrary files.
 */
export const resolveAssetFileUrl = (
  relativePath: string | undefined,
  variable: string,
): string | undefined => {
  const value = relativePath?.trim();
  if (!value) {
    return undefined;
  }

  if (path.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    reportOnce(variable, value, 'the path must be relative to assets.');
    return undefined;
  }

  const extension = path.extname(value).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    reportOnce(variable, value, `"${extension}" is not a supported image type.`);
    return undefined;
  }

  const assetsRoot = getAssetPath();
  const candidate = path.resolve(assetsRoot, value);
  if (!isPathWithinDirectory(candidate, assetsRoot)) {
    reportOnce(variable, value, 'the path escapes the assets directory.');
    return undefined;
  }

  try {
    const realAssetsRoot = fs.realpathSync(assetsRoot);
    const realCandidate = fs.realpathSync(candidate);
    if (!isPathWithinDirectory(realCandidate, realAssetsRoot)) {
      reportOnce(variable, value, 'the path resolves outside of assets.');
      return undefined;
    }
    if (!fs.statSync(realCandidate).isFile()) {
      reportOnce(variable, value, 'the path is not a file.');
      return undefined;
    }
    return pathToFileURL(realCandidate).href;
  } catch {
    reportOnce(variable, value, 'the file could not be read.');
    return undefined;
  }
};

export const getBrandingLogoUrl = () =>
  resolveAssetFileUrl(process.env.APP_LOGO, 'APP_LOGO');

const BACKGROUND_VARIABLES: Record<ThemeBackgroundTarget, string> = {
  sidebar: 'SIDEBAR_BACKGROUND',
  chat: 'CHAT_BACKGROUND',
};

const getBrandingBackgroundUrl = (target: ThemeBackgroundTarget) => {
  const variable = BACKGROUND_VARIABLES[target];
  return resolveAssetFileUrl(process.env[variable], variable);
};

export const getThemeBackgroundLocks = (): ThemeBackgroundLocks => ({
  sidebar: Boolean(getBrandingBackgroundUrl('sidebar')),
  chat: Boolean(getBrandingBackgroundUrl('chat')),
});

/**
 * Branded backgrounds win over the stored ones, but opacity and blur stay
 * user-controlled so the image can still be tuned for readability.
 */
export const applyBrandingThemeBackgrounds = (
  config: ThemeConfig,
): ThemeConfig => {
  const sidebarUrl = getBrandingBackgroundUrl('sidebar');
  const chatUrl = getBrandingBackgroundUrl('chat');
  if (!sidebarUrl && !chatUrl) {
    return config;
  }

  return {
    ...config,
    ...(sidebarUrl
      ? {
          sidebarBackground: { ...config.sidebarBackground, url: sidebarUrl },
        }
      : {}),
    ...(chatUrl
      ? { chatBackground: { ...config.chatBackground, url: chatUrl } }
      : {}),
  };
};
