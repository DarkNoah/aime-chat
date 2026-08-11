import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  ThemeBackgroundConfig,
  ThemeBackgroundSourcePaths,
  ThemeBackgroundTarget,
  ThemeConfig,
} from '@/types/app';

const MAX_THEME_BACKGROUND_BYTES = 10 * 1024 * 1024;
const MAX_THEME_BACKGROUND_DIMENSION = 8192;
const MAX_THEME_BACKGROUND_PIXELS = 40_000_000;
const DEFAULT_BACKGROUND_OPACITY = 0.2;
const DEFAULT_BACKGROUND_BLUR = 0;
const MANAGED_BACKGROUND_FILE_PATTERN =
  /^(sidebar|chat)-([0-9a-f]{16})\.(png|jpg|webp)$/;

const IMAGE_SIGNATURES: Record<string, (header: Buffer) => boolean> = {
  '.jpeg': (header) =>
    header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  '.jpg': (header) =>
    header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  '.png': (header) =>
    header
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.webp': (header) =>
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP',
};

const clampNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
};

export const createDefaultThemeConfig = (): ThemeConfig => ({
  sidebarBackground: {
    opacity: DEFAULT_BACKGROUND_OPACITY,
    blur: DEFAULT_BACKGROUND_BLUR,
  },
  chatBackground: {
    opacity: DEFAULT_BACKGROUND_OPACITY,
    blur: DEFAULT_BACKGROUND_BLUR,
  },
});

export const getThemeBackgroundDirectory = (userDataPath: string) =>
  path.join(userDataPath, 'theme', 'backgrounds');

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

const ensureThemeBackgroundDirectory = async (userDataPath: string) => {
  await fs.promises.mkdir(userDataPath, { recursive: true });
  const realUserDataPath = await fs.promises.realpath(userDataPath);
  const themeDirectory = path.join(userDataPath, 'theme');
  const destinationDirectory = getThemeBackgroundDirectory(userDataPath);

  const ensureSafeDirectory = async (directory: string) => {
    await fs.promises.mkdir(directory).catch((error: unknown) => {
      if ((error as { code?: string }).code !== 'EEXIST') {
        throw error;
      }
    });
    const stats = await fs.promises.lstat(directory);
    const realDirectory = await fs.promises.realpath(directory);
    if (
      !stats.isDirectory() ||
      stats.isSymbolicLink() ||
      !isPathWithinDirectory(realDirectory, realUserDataPath)
    ) {
      throw new Error('The theme background directory is not safe.');
    }
  };

  await ensureSafeDirectory(themeDirectory);
  await ensureSafeDirectory(destinationDirectory);

  return fs.promises.realpath(destinationDirectory);
};

const normalizeManagedBackgroundUrl = (
  value: unknown,
  userDataPath: string,
): string | undefined => {
  if (typeof value !== 'string' || !value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'file:') {
      return undefined;
    }
    const filePath = fileURLToPath(parsed);
    const destinationDirectory = getThemeBackgroundDirectory(userDataPath);
    const fileNameMatch = path
      .basename(filePath)
      .match(MANAGED_BACKGROUND_FILE_PATTERN);
    if (!fileNameMatch || !fs.existsSync(destinationDirectory)) {
      return undefined;
    }

    const directoryStats = fs.lstatSync(destinationDirectory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      return undefined;
    }
    const realUserDataPath = fs.realpathSync(userDataPath);
    const realDirectoryPath = fs.realpathSync(destinationDirectory);
    const fileStats = fs.lstatSync(filePath);
    if (
      !fileStats.isFile() ||
      fileStats.isSymbolicLink() ||
      fileStats.size <= 0 ||
      fileStats.size > MAX_THEME_BACKGROUND_BYTES
    ) {
      return undefined;
    }
    const realFilePath = fs.realpathSync(filePath);
    if (
      !isPathWithinDirectory(realDirectoryPath, realUserDataPath) ||
      !isPathWithinDirectory(realFilePath, realDirectoryPath)
    ) {
      return undefined;
    }

    const content = fs.readFileSync(realFilePath);
    const extension = `.${fileNameMatch[3]}`;
    const matchesSignature = IMAGE_SIGNATURES[extension];
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (!matchesSignature?.(content) || !digest.startsWith(fileNameMatch[2])) {
      return undefined;
    }
    return pathToFileURL(realFilePath).href;
  } catch {
    return undefined;
  }
};

const normalizeBackgroundConfig = (
  value: unknown,
  userDataPath: string,
): ThemeBackgroundConfig => {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const url = normalizeManagedBackgroundUrl(input.url, userDataPath);

  return {
    ...(url ? { url } : {}),
    opacity: clampNumber(input.opacity, DEFAULT_BACKGROUND_OPACITY, 0, 0.5),
    blur: clampNumber(input.blur, DEFAULT_BACKGROUND_BLUR, 0, 20),
  };
};

export const normalizeThemeConfig = (
  value: unknown,
  userDataPath: string,
): ThemeConfig => {
  const input =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const primaryColor =
    typeof input.primaryColor === 'string' &&
    /^#[0-9a-f]{6}$/i.test(input.primaryColor)
      ? input.primaryColor.toUpperCase()
      : undefined;

  return {
    ...(primaryColor ? { primaryColor } : {}),
    sidebarBackground: normalizeBackgroundConfig(
      input.sidebarBackground,
      userDataPath,
    ),
    chatBackground: normalizeBackgroundConfig(
      input.chatBackground,
      userDataPath,
    ),
  };
};

export const removeReplacedThemeBackgrounds = async (
  previousConfig: ThemeConfig,
  nextConfig: ThemeConfig,
  userDataPath: string,
) => {
  const destinationDirectory = getThemeBackgroundDirectory(userDataPath);
  if (!fs.existsSync(destinationDirectory)) {
    return;
  }

  const directoryStats = await fs.promises.lstat(destinationDirectory);
  const realUserDataPath = await fs.promises.realpath(userDataPath);
  const realDirectoryPath = await fs.promises.realpath(destinationDirectory);
  if (
    !directoryStats.isDirectory() ||
    directoryStats.isSymbolicLink() ||
    !isPathWithinDirectory(realDirectoryPath, realUserDataPath)
  ) {
    return;
  }

  const nextFiles = new Set(
    [nextConfig.sidebarBackground.url, nextConfig.chatBackground.url]
      .filter((url): url is string => Boolean(url))
      .map((url) => path.basename(fileURLToPath(url))),
  );
  const replacedFiles = new Set(
    [previousConfig.sidebarBackground.url, previousConfig.chatBackground.url]
      .filter((url): url is string => Boolean(url))
      .map((url) => path.basename(fileURLToPath(url)))
      .filter(
        (fileName) =>
          MANAGED_BACKGROUND_FILE_PATTERN.test(fileName) &&
          !nextFiles.has(fileName),
      ),
  );

  await Promise.all(
    [...replacedFiles].map(async (fileName) => {
      const filePath = path.join(realDirectoryPath, fileName);
      const stats = await fs.promises.lstat(filePath).catch(() => undefined);
      if (!stats?.isFile() || stats.isSymbolicLink()) {
        return;
      }
      const realFilePath = await fs.promises.realpath(filePath);
      if (!isPathWithinDirectory(realFilePath, realDirectoryPath)) {
        return;
      }
      await fs.promises.unlink(realFilePath);
    }),
  );
};

const validateThemeBackground = async (sourcePath: string) => {
  const extension = path.extname(sourcePath).toLowerCase();
  const matchesSignature = IMAGE_SIGNATURES[extension];
  if (!matchesSignature) {
    throw new Error('Unsupported image format. Choose PNG, JPEG, or WebP.');
  }

  const fileHandle = await fs.promises.open(sourcePath, 'r');
  let content: Buffer;
  try {
    const stats = await fileHandle.stat();
    if (!stats.isFile()) {
      throw new Error('The selected background is not a file.');
    }
    if (stats.size <= 0 || stats.size > MAX_THEME_BACKGROUND_BYTES) {
      throw new Error('The selected background must be 10 MB or smaller.');
    }
    content = await fileHandle.readFile();
  } finally {
    await fileHandle.close();
  }

  if (!matchesSignature(content)) {
    throw new Error('The selected file does not contain a valid image.');
  }

  const outputExtension = extension === '.jpeg' ? '.jpg' : extension;
  try {
    const image = sharp(content, {
      failOn: 'error',
      limitInputPixels: MAX_THEME_BACKGROUND_PIXELS,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_THEME_BACKGROUND_DIMENSION ||
      metadata.height > MAX_THEME_BACKGROUND_DIMENSION ||
      metadata.width * metadata.height > MAX_THEME_BACKGROUND_PIXELS
    ) {
      throw new Error('The selected image dimensions are too large.');
    }

    const normalizedImage = image.rotate();
    let normalizedContent: Buffer;
    if (outputExtension === '.png') {
      normalizedContent = await normalizedImage
        .png({ compressionLevel: 9 })
        .toBuffer();
    } else if (outputExtension === '.jpg') {
      normalizedContent = await normalizedImage
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } else {
      normalizedContent = await normalizedImage
        .webp({ quality: 90 })
        .toBuffer();
    }
    if (normalizedContent.length > MAX_THEME_BACKGROUND_BYTES) {
      throw new Error('The processed background is larger than 10 MB.');
    }
    return { content: normalizedContent, extension: outputExtension };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('dimensions are too large') ||
        error.message.includes('processed background is larger'))
    ) {
      throw error;
    }
    throw new Error('The selected file does not contain a valid image.');
  }
};

type StoredThemeBackground = {
  url: string;
  fileName: string;
};

export const storeThemeBackground = async (
  sourcePath: string,
  target: ThemeBackgroundTarget,
  userDataPath: string,
): Promise<StoredThemeBackground> => {
  if (target !== 'sidebar' && target !== 'chat') {
    throw new Error('Invalid theme background target.');
  }
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new Error('The theme background source path must be absolute.');
  }

  const resolvedSourcePath = await fs.promises.realpath(sourcePath);
  const { content, extension } =
    await validateThemeBackground(resolvedSourcePath);
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const fileName = `${target}-${digest.slice(0, 16)}${extension}`;
  const realDirectoryPath = await ensureThemeBackgroundDirectory(userDataPath);
  const destinationPath = path.join(realDirectoryPath, fileName);

  if (fs.existsSync(destinationPath)) {
    const destinationStats = await fs.promises.lstat(destinationPath);
    const existingContent =
      destinationStats.isFile() && !destinationStats.isSymbolicLink()
        ? await fs.promises.readFile(destinationPath)
        : undefined;
    if (!existingContent || !existingContent.equals(content)) {
      throw new Error('The managed theme background is invalid.');
    }
  } else {
    const temporaryPath = path.join(
      realDirectoryPath,
      `.${fileName}.${crypto.randomUUID()}.tmp`,
    );
    try {
      const temporaryHandle = await fs.promises.open(
        temporaryPath,
        'wx',
        0o600,
      );
      try {
        await temporaryHandle.writeFile(content);
        await temporaryHandle.sync();
      } finally {
        await temporaryHandle.close();
      }
      try {
        await fs.promises.rename(temporaryPath, destinationPath);
      } catch (error) {
        const existingContent = await fs.promises
          .readFile(destinationPath)
          .catch(() => undefined);
        if (!existingContent?.equals(content)) {
          throw error;
        }
      }
    } finally {
      await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
  }

  return {
    url: pathToFileURL(destinationPath).href,
    fileName,
  };
};

type SaveThemeConfigOptions = {
  value: unknown;
  sourcePaths?: ThemeBackgroundSourcePaths;
  previousConfig: ThemeConfig;
  userDataPath: string;
  persist: (config: ThemeConfig) => Promise<void>;
  onCleanupError?: (error: unknown) => void;
};

const validateThemeBackgroundSourcePaths = (
  value: ThemeBackgroundSourcePaths | undefined,
) => {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid theme background source paths.');
  }
  const targets = Object.keys(value);
  if (targets.some((target) => target !== 'sidebar' && target !== 'chat')) {
    throw new Error('Invalid theme background target.');
  }
  targets.forEach((target) => {
    const sourcePath = value[target as ThemeBackgroundTarget];
    if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
      throw new Error('The theme background source path must be absolute.');
    }
  });
};

export const saveThemeConfig = async ({
  value,
  sourcePaths,
  previousConfig,
  userDataPath,
  persist,
  onCleanupError,
}: SaveThemeConfigOptions): Promise<ThemeConfig> => {
  validateThemeBackgroundSourcePaths(sourcePaths);
  const baseConfig = normalizeThemeConfig(value, userDataPath);
  let nextConfig = baseConfig;
  const cleanup = async (from: ThemeConfig, to: ThemeConfig) => {
    await removeReplacedThemeBackgrounds(from, to, userDataPath).catch(
      (error) => onCleanupError?.(error),
    );
  };

  try {
    const storeSourcePath = async (target: ThemeBackgroundTarget) => {
      const sourcePath = sourcePaths?.[target];
      if (!sourcePath) {
        return;
      }
      const stored = await storeThemeBackground(
        sourcePath,
        target,
        userDataPath,
      );
      const key = target === 'sidebar' ? 'sidebarBackground' : 'chatBackground';
      nextConfig = {
        ...nextConfig,
        [key]: {
          ...nextConfig[key],
          url: stored.url,
        },
      };
    };
    await storeSourcePath('sidebar');
    await storeSourcePath('chat');
  } catch (error) {
    await cleanup(nextConfig, baseConfig);
    throw error;
  }

  try {
    await persist(nextConfig);
  } catch (error) {
    await cleanup(nextConfig, previousConfig);
    throw error;
  }

  await cleanup(previousConfig, nextConfig);
  return nextConfig;
};
