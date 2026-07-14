import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import type { SkillMetadata } from '@/types/skill-metadata';
import {
  parseSkillMarkdown,
  readSkillPackageMetadata,
} from '../utils/skill-metadata';

export type MarketSkillPackage = SkillMetadata & {
  id: string;
  name: string;
  description: string;
  autoInstall: boolean;
  url?: string;
  group?: string;
  packagePath: string;
  packageType: 'directory' | 'archive';
};

const ARCHIVE_EXTENSIONS = new Set(['.skill', '.zip']);

type ArchiveEntry = {
  path: string;
  buffer(): Promise<Buffer>;
};

function getGroup(marketPath: string, packagePath: string) {
  const relativeParent = path.relative(marketPath, path.dirname(packagePath));
  if (!relativeParent) return undefined;

  return relativeParent.split(path.sep).filter(Boolean)[0];
}

function getImageMimeType(filePath: string) {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case '.svg':
      return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

async function readArchiveIcon(
  entries: ArchiveEntry[],
  skillMdPath: string | undefined,
  icon: string | undefined,
) {
  if (!icon || /^(data:|https?:|file:)/i.test(icon)) return icon;

  const iconPath = path.posix.normalize(
    path.posix.join(path.posix.dirname(skillMdPath || ''), icon),
  );
  const iconEntry = entries.find((entry) => entry.path === iconPath);
  if (!iconEntry) return undefined;

  const buffer = await iconEntry.buffer();
  return `data:${getImageMimeType(iconPath)};base64,${buffer.toString('base64')}`;
}

async function readDirectoryPackage(
  marketPath: string,
  packagePath: string,
): Promise<MarketSkillPackage | undefined> {
  const skillMdPath = path.join(packagePath, 'SKILL.md');
  const hasSkillMd = await fs.promises
    .access(skillMdPath)
    .then(() => true)
    .catch(() => false);

  if (!hasSkillMd) return undefined;

  const metadata = await readSkillPackageMetadata(packagePath);
  const id = path.basename(packagePath);

  return {
    ...metadata,
    id,
    name: metadata.name || id,
    description: metadata.description || '',
    autoInstall: metadata.autoInstall === true,
    group: getGroup(marketPath, packagePath),
    packagePath,
    packageType: 'directory',
  };
}

async function readArchivePackage(
  marketPath: string,
  packagePath: string,
): Promise<MarketSkillPackage | undefined> {
  const archive = await unzipper.Open.file(packagePath);
  const skillMdEntry = archive.files.find(
    (entry) => path.posix.basename(entry.path).toLowerCase() === 'skill.md',
  );

  if (!skillMdEntry) return undefined;

  const { metadata } = parseSkillMarkdown(
    (await skillMdEntry.buffer()).toString('utf-8'),
  );
  const id = path.basename(packagePath, path.extname(packagePath));
  const icon = await readArchiveIcon(
    archive.files,
    skillMdEntry.path,
    metadata.icon,
  );

  return {
    ...metadata,
    id,
    name: metadata.name || id,
    description: metadata.description || '',
    autoInstall: metadata.autoInstall === true,
    icon,
    group: getGroup(marketPath, packagePath),
    packagePath,
    packageType: 'archive',
  };
}

async function readPackage(
  marketPath: string,
  packagePath: string,
  isDirectory: boolean,
) {
  if (isDirectory) {
    return readDirectoryPackage(marketPath, packagePath);
  }

  if (ARCHIVE_EXTENSIONS.has(path.extname(packagePath).toLowerCase())) {
    return readArchivePackage(marketPath, packagePath);
  }

  return undefined;
}

export async function discoverMarketSkillPackages(
  marketPath: string,
): Promise<MarketSkillPackage[]> {
  const safelyReadPackage = async (
    packagePath: string,
    isDirectory: boolean,
  ) => {
    try {
      return await readPackage(marketPath, packagePath, isDirectory);
    } catch (error) {
      console.error(
        `Failed to read market skill package: ${packagePath}`,
        error,
      );
      return undefined;
    }
  };

  const entries = await fs.promises.readdir(marketPath, {
    withFileTypes: true,
  });
  const visibleEntries = entries.filter((entry) => !entry.name.startsWith('.'));
  const discovered = await Promise.all(
    visibleEntries.map(async (entry) => {
      const entryPath = path.join(marketPath, entry.name);
      if (!entry.isDirectory()) {
        return [await safelyReadPackage(entryPath, false)];
      }

      const rootPackage = await safelyReadPackage(entryPath, true);
      if (rootPackage) return [rootPackage];

      // A first-level directory without its own skill package is a group.
      const groupEntries = await fs.promises.readdir(entryPath, {
        withFileTypes: true,
      });
      const visibleGroupEntries = groupEntries.filter(
        (groupEntry) => !groupEntry.name.startsWith('.'),
      );

      return Promise.all(
        visibleGroupEntries.map((groupEntry) =>
          safelyReadPackage(
            path.join(entryPath, groupEntry.name),
            groupEntry.isDirectory(),
          ),
        ),
      );
    }),
  );

  return discovered
    .flat()
    .filter((skill): skill is MarketSkillPackage => Boolean(skill));
}
