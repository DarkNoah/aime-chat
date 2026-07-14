import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import matter from 'gray-matter';
import type { SkillMetadata } from '@/types/skill-metadata';

export type SkillPackageMetadata = SkillMetadata & {
  name?: string;
  description?: string;
  autoInstall?: boolean;
  url?: string;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeSkillMetadata(
  data: Record<string, unknown>,
): SkillPackageMetadata {
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((tag): tag is string => typeof tag === 'string')
    : undefined;

  return {
    name: optionalString(data.name),
    title: optionalString(data.title),
    displayName:
      optionalString(data.display_name) || optionalString(data.displayName),
    version: optionalString(data.version),
    category: optionalString(data.category),
    description: optionalString(data.description),
    icon: optionalString(data.icon),
    tags: tags?.length ? tags : undefined,
    entrypoints: stringRecord(data.entrypoints),
    autoInstall:
      typeof data.autoInstall === 'boolean' ? data.autoInstall : undefined,
    url: optionalString(data.url),
  };
}

export function parseSkillMarkdown(content: string) {
  const parsed = matter(content);
  return {
    metadata: normalizeSkillMetadata(parsed.data as Record<string, unknown>),
    content: parsed.content,
  };
}

function getImageMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
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

export async function resolveSkillIcon(
  icon: string | undefined,
  skillPath: string,
  inline = false,
) {
  if (!icon) return undefined;
  if (/^(data:|https?:|file:)/i.test(icon)) return icon;

  const iconPath = path.resolve(skillPath, icon);
  if (!fs.existsSync(iconPath)) return undefined;
  if (!inline) return pathToFileURL(iconPath).toString();

  const buffer = await fs.promises.readFile(iconPath);
  return `data:${getImageMimeType(iconPath)};base64,${buffer.toString('base64')}`;
}

export async function readSkillPackageMetadata(
  skillPath: string,
  options?: { inlineIcon?: boolean },
): Promise<SkillPackageMetadata & { content?: string }> {
  const markdownPath = path.join(skillPath, 'SKILL.md');
  const markdown = await fs.promises
    .readFile(markdownPath, 'utf-8')
    .then(parseSkillMarkdown)
    .catch(() => ({
      metadata: {} as SkillPackageMetadata,
      content: undefined,
    }));
  const { metadata } = markdown;

  return {
    ...metadata,
    name: metadata.name || path.basename(skillPath),
    description: metadata.description || '',
    icon: await resolveSkillIcon(metadata.icon, skillPath, options?.inlineIcon),
    content: markdown.content,
  };
}
