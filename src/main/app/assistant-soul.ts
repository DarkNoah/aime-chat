import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import matter from 'gray-matter';
import { getAssetPath } from '../utils';
import {
  AssistantSoulLibrary,
  AssistantSoulPreset,
  AssistantSoulSettings,
  defaultAssistantSoul,
  normalizeAssistantSoul,
  SaveAssistantSoulInput,
} from '@/types/assistant-soul';

const ASSISTANTS_DIR = 'assistants';
const SOUL_FILE = 'SOUL.md';
const AVATAR_FILE = 'avatar.png';
const LEGACY_AVATAR_FILE = 'avatar.svg';
const LEGACY_VOICE_FILE = 'voice.json';
const LEGACY_ASSISTANT_IDS: Record<string, string> = {
  'pragmatic-engineer': 'Forge',
  'warm-companion': 'Mira',
  'rigorous-researcher': 'Sage',
  'creative-collaborator': 'Nova',
};

const getUserAssistantRoot = () =>
  path.join(app.getPath('userData'), ASSISTANTS_DIR);

const getDefaultAssistantRoot = () => getAssetPath('assistant');

const assertInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid assistant file path');
  }
};

const titleFromFolderName = (folderName: string) =>
  folderName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || folderName;

const resolveAssistantId = (id: string | undefined) =>
  id ? LEGACY_ASSISTANT_IDS[id] ?? id : undefined;

const readSoulFile = async (soulFilePath: string | undefined) => {
  if (!soulFilePath) return matter('');
  try {
    return matter(await fs.promises.readFile(soulFilePath, 'utf-8'));
  } catch {
    return matter('');
  }
};

const listAssistantDirectories = async (root: string) => {
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};

const copyDirectoryIfMissing = async (sourceDir: string, targetDir: string) => {
  if (fs.existsSync(targetDir)) {
    return;
  }

  await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.promises.cp(sourceDir, targetDir, {
    recursive: true,
    force: false,
  });
};

const copyFileIfMissing = async (sourceFile: string, targetFile: string) => {
  if (!fs.existsSync(sourceFile) || fs.existsSync(targetFile)) {
    return;
  }

  await fs.promises.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.promises.copyFile(sourceFile, targetFile);
};

const syncDefaultAssistantFiles = async (sourceDir: string, targetDir: string) => {
  await copyFileIfMissing(
    path.join(sourceDir, AVATAR_FILE),
    path.join(targetDir, AVATAR_FILE),
  );
  await fs.promises.rm(path.join(targetDir, LEGACY_AVATAR_FILE), {
    force: true,
  });
  await fs.promises.rm(path.join(targetDir, LEGACY_VOICE_FILE), {
    force: true,
  });
};

const copyDirectory = async (sourceDir: string, targetDir: string) => {
  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.promises.cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });
};

const seedDefaultAssistants = async () => {
  const defaultRoot = getDefaultAssistantRoot();
  const userRoot = getUserAssistantRoot();
  await fs.promises.mkdir(userRoot, { recursive: true });

  for (const [legacyId, currentId] of Object.entries(LEGACY_ASSISTANT_IDS)) {
    const legacyDir = path.join(userRoot, legacyId);
    const currentDir = path.join(userRoot, currentId);
    if (fs.existsSync(legacyDir) && !fs.existsSync(currentDir)) {
      await fs.promises.rename(legacyDir, currentDir);
    }
  }

  const defaultAssistantNames = await listAssistantDirectories(defaultRoot);
  for (const name of defaultAssistantNames) {
    const defaultDir = path.join(defaultRoot, name);
    const userDir = path.join(userRoot, name);
    await copyDirectoryIfMissing(defaultDir, userDir);
    await syncDefaultAssistantFiles(defaultDir, userDir);
  }

  const userAssistantNames = await listAssistantDirectories(userRoot);
  await Promise.all(
    userAssistantNames.map((name) =>
      fs.promises.rm(path.join(userRoot, name, LEGACY_VOICE_FILE), {
        force: true,
      }),
    ),
  );
};

const buildAssistantPreset = async (
  root: string,
  folderName: string,
): Promise<AssistantSoulPreset> => {
  const assistantDir = path.join(root, folderName);
  assertInside(root, assistantDir);

  const soulFilePath = path.join(assistantDir, SOUL_FILE);
  const avatarFilePath = path.join(assistantDir, AVATAR_FILE);
  const soulFile = await readSoulFile(soulFilePath);
  const name =
    typeof soulFile.data.name === 'string' && soulFile.data.name.trim()
      ? soulFile.data.name.trim()
      : titleFromFolderName(folderName);
  const description =
    typeof soulFile.data.description === 'string'
      ? soulFile.data.description
      : undefined;
  const voiceStyle =
    typeof soulFile.data['voice-style'] === 'string'
      ? soulFile.data['voice-style']
      : undefined;

  return {
    id: folderName,
    name,
    description,
    voiceStyle,
    avatarPath: `${folderName}/${AVATAR_FILE}`,
    avatarFilePath: fs.existsSync(avatarFilePath) ? avatarFilePath : undefined,
    soulPath: `${folderName}/${SOUL_FILE}`,
    soulFilePath,
    content: soulFile.content.trim(),
  };
};

const buildUserLibrary = async (
  settings?: Partial<AssistantSoulSettings> | null,
): Promise<AssistantSoulLibrary> => {
  const root = getUserAssistantRoot();
  const normalized = normalizeAssistantSoul(settings ?? defaultAssistantSoul);
  const normalizedPresetId = resolveAssistantId(normalized.presetId);
  const assistantNames = await listAssistantDirectories(root);
  const assistants = await Promise.all(
    assistantNames.map((name) => buildAssistantPreset(root, name)),
  );
  const activeId = assistants.some((assistant) => assistant.id === normalizedPresetId)
    ? normalizedPresetId
    : undefined;

  return {
    enabled: !!(normalized.enabled && activeId),
    activeId,
    directory: root,
    assistants,
  };
};

const writeSoulContent = async (soulFilePath: string, content: string) => {
  const existing = await readSoulFile(soulFilePath);
  await fs.promises.writeFile(
    soulFilePath,
    matter.stringify(content, existing.data),
    'utf-8',
  );
};

export const getAssistantSoulLibrary = async (
  ensure = false,
  settings?: Partial<AssistantSoulSettings> | null,
): Promise<AssistantSoulLibrary> => {
  if (ensure) {
    await seedDefaultAssistants();
  }

  return buildUserLibrary(settings);
};

export const resetAssistantSoul = async (
  id: string,
  settings?: Partial<AssistantSoulSettings> | null,
): Promise<AssistantSoulLibrary> => {
  const assistantId = resolveAssistantId(id) ?? id;
  const defaultDir = path.join(getDefaultAssistantRoot(), assistantId);
  const userDir = path.join(getUserAssistantRoot(), assistantId);
  assertInside(getDefaultAssistantRoot(), defaultDir);
  assertInside(getUserAssistantRoot(), userDir);

  if (!fs.existsSync(defaultDir)) {
    throw new Error(`Default assistant "${assistantId}" does not exist`);
  }

  await copyDirectory(defaultDir, userDir);
  return getAssistantSoulLibrary(true, settings);
};

export const saveAssistantSoul = async (
  input: SaveAssistantSoulInput,
): Promise<AssistantSoulLibrary> => {
  await seedDefaultAssistants();

  const root = getUserAssistantRoot();
  const activeId = resolveAssistantId(input.activeId);
  if (input.assistant?.id) {
    const assistantId = resolveAssistantId(input.assistant.id) ?? input.assistant.id;
    const assistantDir = path.join(root, assistantId);
    assertInside(root, assistantDir);
    await fs.promises.mkdir(assistantDir, { recursive: true });

    if (input.assistant.content !== undefined) {
      await writeSoulContent(
        path.join(assistantDir, SOUL_FILE),
        input.assistant.content,
      );
    }

    await fs.promises.rm(path.join(assistantDir, LEGACY_VOICE_FILE), {
      force: true,
    });
  }

  return getAssistantSoulLibrary(true, {
    enabled: input.enabled,
    presetId: input.enabled ? activeId : undefined,
    content: '',
  });
};

export const getActiveAssistantSoul = async (
  legacyValue?: Partial<AssistantSoulSettings> | null,
): Promise<AssistantSoulSettings> => {
  const normalized = normalizeAssistantSoul(legacyValue ?? defaultAssistantSoul);
  const normalizedPresetId = resolveAssistantId(normalized.presetId);
  if (!normalized.enabled || !normalizedPresetId) {
    return normalizeAssistantSoul(defaultAssistantSoul);
  }

  const library = await getAssistantSoulLibrary(true, {
    ...normalized,
    presetId: normalizedPresetId,
  });
  const activeAssistant = library.assistants.find(
    (assistant) => assistant.id === normalizedPresetId,
  );

  if (!activeAssistant?.content?.trim()) {
    return normalizeAssistantSoul(defaultAssistantSoul);
  }

  return normalizeAssistantSoul({
    enabled: true,
    presetId: activeAssistant.id,
    content: activeAssistant.content,
  });
};
