import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { getAssetPath } from '../utils';
import {
  AssistantSoulLibrary,
  AssistantSoulPreset,
  AssistantSoulSettings,
  AssistantVoicePreset,
  defaultAssistantSoul,
  normalizeAssistantSoul,
  SaveAssistantSoulInput,
} from '@/types/assistant-soul';

type AssistantIndexItem = Omit<
  AssistantSoulPreset,
  'content' | 'avatarFilePath' | 'soulFilePath' | 'voiceFilePath'
> & {
  content?: string;
};

type AssistantIndex = {
  version: number;
  enabled?: boolean;
  activeId?: string;
  assistants: AssistantIndexItem[];
};

const ASSISTANTS_DIR = 'assistants';
const INDEX_FILE = 'assistants.json';

const getUserAssistantRoot = () =>
  path.join(app.getPath('userData'), ASSISTANTS_DIR);

const getDefaultAssistantRoot = () => getAssetPath('assistant');

const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');

const slugify = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `assistant-${Date.now()}`;
};

const assertInside = (root: string, target: string) => {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid assistant file path');
  }
};

const resolveUserFile = (root: string, filePath?: string) => {
  if (!filePath) return undefined;
  const resolved = path.resolve(root, filePath);
  assertInside(root, resolved);
  return resolved;
};

const resolveAssetFile = (filePath: string | undefined, fallback: string) => {
  if (!filePath) {
    return path.join(getDefaultAssistantRoot(), fallback);
  }

  const cleanPath = normalizeSlashes(filePath);
  if (cleanPath.startsWith('assets/')) {
    return getAssetPath(...cleanPath.slice('assets/'.length).split('/'));
  }

  return path.join(getDefaultAssistantRoot(), cleanPath);
};

const readJsonFile = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
};

const writeJsonFile = async (filePath: string, value: unknown) => {
  await fs.promises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
};

const copyIfExists = async (source: string, target: string) => {
  try {
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(source, target);
  } catch {
    // Missing optional default assets should not block the assistant library.
  }
};

const readDefaultIndex = async (): Promise<AssistantIndex> => {
  const indexPath = path.join(getDefaultAssistantRoot(), INDEX_FILE);
  const index = await readJsonFile<AssistantIndex>(indexPath);
  return {
    version: index?.version ?? 1,
    enabled: false,
    activeId: undefined,
    assistants: index?.assistants ?? [],
  };
};

const readVoice = async (
  voiceFilePath: string | undefined,
  fallback: AssistantVoicePreset | undefined,
) => {
  if (!voiceFilePath) return fallback;
  return (await readJsonFile<AssistantVoicePreset>(voiceFilePath)) ?? fallback;
};

const readSoulContent = async (soulFilePath: string | undefined, fallback = '') => {
  if (!soulFilePath) return fallback;
  try {
    return await fs.promises.readFile(soulFilePath, 'utf-8');
  } catch {
    return fallback;
  }
};

const readDefaultLibrary = async (): Promise<AssistantSoulLibrary> => {
  const index = await readDefaultIndex();
  const assistants = await Promise.all(
    index.assistants.map(async (assistant) => {
      const soulFilePath = resolveAssetFile(
        assistant.soulPath,
        path.join(assistant.id, 'SOUL.md'),
      );
      const avatarFilePath = resolveAssetFile(
        assistant.avatarPath,
        path.join(assistant.id, 'avatar.svg'),
      );
      const voiceFilePath = resolveAssetFile(
        assistant.voicePath,
        path.join(assistant.id, 'voice.json'),
      );

      return {
        ...assistant,
        avatarFilePath: fs.existsSync(avatarFilePath)
          ? avatarFilePath
          : undefined,
        soulFilePath,
        voiceFilePath: fs.existsSync(voiceFilePath) ? voiceFilePath : undefined,
        voice: await readVoice(voiceFilePath, assistant.voice),
        content: await readSoulContent(soulFilePath, assistant.content),
      };
    }),
  );

  return {
    enabled: false,
    activeId: undefined,
    directory: getDefaultAssistantRoot(),
    assistants,
  };
};

const getUserIndexPath = () => path.join(getUserAssistantRoot(), INDEX_FILE);

const createInitialUserIndex = async () => {
  const root = getUserAssistantRoot();
  const defaultIndex = await readDefaultIndex();
  const assistants: AssistantIndexItem[] = [];

  await fs.promises.mkdir(root, { recursive: true });

  for (const assistant of defaultIndex.assistants) {
    const id = slugify(assistant.id);
    const targetDir = path.join(root, id);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const soulPath = `${id}/SOUL.md`;
    const avatarPath = `${id}/avatar.svg`;
    const voicePath = `${id}/voice.json`;

    await copyIfExists(
      resolveAssetFile(assistant.soulPath, path.join(assistant.id, 'SOUL.md')),
      path.join(root, soulPath),
    );
    await copyIfExists(
      resolveAssetFile(
        assistant.avatarPath,
        path.join(assistant.id, 'avatar.svg'),
      ),
      path.join(root, avatarPath),
    );
    await copyIfExists(
      resolveAssetFile(assistant.voicePath, path.join(assistant.id, 'voice.json')),
      path.join(root, voicePath),
    );

    assistants.push({
      ...assistant,
      id,
      avatarPath,
      soulPath,
      voicePath,
      content: undefined,
    } as AssistantIndexItem);
  }

  const index: AssistantIndex = {
    version: 1,
    enabled: false,
    activeId: undefined,
    assistants,
  };
  await writeJsonFile(getUserIndexPath(), index);
};

const ensureUserLibrary = async () => {
  if (fs.existsSync(getUserIndexPath())) {
    return;
  }
  await createInitialUserIndex();
};

const readUserIndex = async (ensure: boolean): Promise<AssistantIndex | undefined> => {
  if (ensure) {
    await ensureUserLibrary();
  }
  return await readJsonFile<AssistantIndex>(getUserIndexPath());
};

const buildUserLibrary = async (
  index: AssistantIndex,
): Promise<AssistantSoulLibrary> => {
  const root = getUserAssistantRoot();
  const assistants = await Promise.all(
    index.assistants.map(async (assistant) => {
      const soulFilePath = resolveUserFile(root, assistant.soulPath);
      const avatarFilePath = resolveUserFile(root, assistant.avatarPath);
      const voiceFilePath = resolveUserFile(root, assistant.voicePath);

      return {
        ...assistant,
        soulFilePath,
        avatarFilePath:
          avatarFilePath && fs.existsSync(avatarFilePath)
            ? avatarFilePath
            : undefined,
        voiceFilePath:
          voiceFilePath && fs.existsSync(voiceFilePath)
            ? voiceFilePath
            : undefined,
        voice: await readVoice(voiceFilePath, assistant.voice),
        content: await readSoulContent(soulFilePath, assistant.content),
      };
    }),
  );

  return {
    enabled: !!index.enabled,
    activeId: index.activeId,
    directory: root,
    assistants,
  };
};

export const getAssistantSoulLibrary = async (
  ensure = false,
): Promise<AssistantSoulLibrary> => {
  const index = await readUserIndex(ensure);
  if (!index) {
    return readDefaultLibrary();
  }
  return buildUserLibrary(index);
};

const createFallbackAvatar = async (filePath: string, name: string) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AI';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#101828"/>
  <circle cx="92" cy="34" r="18" fill="#22c55e"/>
  <path d="M28 84c10-22 24-33 42-33s32 11 42 33" fill="none" stroke="#f8fafc" stroke-width="10" stroke-linecap="round"/>
  <text x="64" y="74" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" fill="#f8fafc">${initials}</text>
</svg>
`;
  await fs.promises.writeFile(filePath, svg, 'utf-8');
};

export const saveAssistantSoul = async (
  input: SaveAssistantSoulInput,
): Promise<AssistantSoulLibrary> => {
  await ensureUserLibrary();

  const root = getUserAssistantRoot();
  const index = (await readUserIndex(true)) ?? {
    version: 1,
    assistants: [],
  };

  let activeId = input.activeId ?? index.activeId;
  const assistantInput = input.assistant;

  if (assistantInput) {
    const id = slugify(assistantInput.id || assistantInput.name || activeId || '');
    const name = assistantInput.name?.trim() || id;
    const assistantDir = path.join(root, id);
    assertInside(root, assistantDir);
    await fs.promises.mkdir(assistantDir, { recursive: true });

    const soulPath = `${id}/SOUL.md`;
    const avatarPath = `${id}/avatar.svg`;
    const voicePath = `${id}/voice.json`;

    await fs.promises.writeFile(
      path.join(root, soulPath),
      assistantInput.content ?? '',
      'utf-8',
    );

    if (assistantInput.voice) {
      await writeJsonFile(path.join(root, voicePath), assistantInput.voice);
    }

    if (assistantInput.avatarSourcePath) {
      await fs.promises.copyFile(
        assistantInput.avatarSourcePath,
        path.join(root, avatarPath),
      );
    } else if (!fs.existsSync(path.join(root, avatarPath))) {
      await createFallbackAvatar(path.join(root, avatarPath), name);
    }

    const existingIndex = index.assistants.findIndex((item) => item.id === id);
    const existing =
      existingIndex >= 0 ? index.assistants[existingIndex] : undefined;
    const nextAssistant: AssistantIndexItem = {
      ...existing,
      id,
      name,
      title: assistantInput.title,
      titleKey: assistantInput.titleKey,
      description: assistantInput.description,
      descriptionKey: assistantInput.descriptionKey,
      avatarPath,
      soulPath,
      voicePath,
      voice: assistantInput.voice ?? existing?.voice,
    };

    if (existingIndex >= 0) {
      index.assistants[existingIndex] = nextAssistant;
    } else {
      index.assistants.push(nextAssistant);
    }
    activeId = id;
  }

  index.enabled = !!input.enabled;
  index.activeId = input.enabled ? activeId : activeId ?? index.activeId;
  await writeJsonFile(getUserIndexPath(), index);

  return getAssistantSoulLibrary(true);
};

export const getActiveAssistantSoul = async (
  legacyValue?: Partial<AssistantSoulSettings> | null,
): Promise<AssistantSoulSettings> => {
  const hasUserLibrary = fs.existsSync(getUserIndexPath());
  const library = await getAssistantSoulLibrary(false);
  const activeAssistant = library.assistants.find(
    (assistant) => assistant.id === library.activeId,
  );

  if (library.enabled && activeAssistant?.content?.trim()) {
    return normalizeAssistantSoul({
      enabled: true,
      presetId: activeAssistant.id,
      content: activeAssistant.content,
    });
  }

  if (hasUserLibrary) {
    return normalizeAssistantSoul(defaultAssistantSoul);
  }

  return normalizeAssistantSoul(legacyValue ?? defaultAssistantSoul);
};
