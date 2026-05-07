import fs from 'fs';
import os from 'os';
import path from 'path';

let mockUserDataRoot = '';
let mockDefaultAssetRoot = '';

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mockUserDataRoot;
      return path.join(mockUserDataRoot, name);
    },
  },
}));

jest.mock('../../utils', () => ({
  getAssetPath: (...paths: string[]) => path.join(mockDefaultAssetRoot, ...paths),
}));

const buildSoul = (
  name: string,
  description: string,
  voiceStyle: string,
  content: string,
) => `---
name: ${name}
description: ${description}
voice-style: ${voiceStyle}
---
# SOUL.md

${content}`;

const writeAssistant = async (
  root: string,
  name: string,
  soul: string,
  options: { voiceJson?: boolean } = {},
) => {
  const assistantDir = path.join(root, name);
  await fs.promises.mkdir(assistantDir, { recursive: true });
  await fs.promises.writeFile(path.join(assistantDir, 'SOUL.md'), soul, 'utf-8');
  if (options.voiceJson) {
    await fs.promises.writeFile(
      path.join(assistantDir, 'voice.json'),
      JSON.stringify({
        id: `${name}-voice`,
        label: name,
        style: 'test',
      }),
      'utf-8',
    );
  }
};

describe('assistant soul library', () => {
  beforeEach(async () => {
    jest.resetModules();
    const tempRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'aime-assistant-soul-'),
    );
    mockUserDataRoot = path.join(tempRoot, 'user-data');
    mockDefaultAssetRoot = path.join(tempRoot, 'assets');
    await writeAssistant(
      path.join(mockDefaultAssetRoot, 'assistant'),
      'Forge',
      buildSoul('Forge', 'Pragmatic builder', 'calm and direct', 'default soul'),
    );
    await writeAssistant(
      path.join(mockDefaultAssetRoot, 'assistant'),
      'Mira',
      buildSoul('Mira', 'Warm guide', 'soft and patient', 'warm soul'),
    );
  });

  it('seeds default assistant folders into user data without assistants.json', async () => {
    const { getAssistantSoulLibrary } = require('../assistant-soul');

    const library = await getAssistantSoulLibrary(true);

    expect(library.directory).toBe(path.join(mockUserDataRoot, 'assistants'));
    expect(library.assistants.map((assistant) => assistant.id)).toEqual([
      'Forge',
      'Mira',
    ]);
    expect(library.assistants[0].name).toBe('Forge');
    expect(library.assistants[0].description).toBe('Pragmatic builder');
    expect(library.assistants[0].voiceStyle).toBe('calm and direct');
    expect(library.assistants[0].content).toBe('# SOUL.md\n\ndefault soul');
    expect(
      fs.existsSync(path.join(mockUserDataRoot, 'assistants', 'assistants.json')),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(mockUserDataRoot, 'assistants', 'Forge', 'SOUL.md'),
      ),
    ).toBe(true);
  });

  it('uses user assistant folders as the library source', async () => {
    const { getAssistantSoulLibrary } = require('../assistant-soul');
    await getAssistantSoulLibrary(true);
    await writeAssistant(
      path.join(mockUserDataRoot, 'assistants'),
      'manual-assistant',
      buildSoul(
        'Manual Assistant',
        'Manual description',
        'manual voice',
        'manual soul',
      ),
    );

    const library = await getAssistantSoulLibrary(true);

    expect(library.assistants.map((assistant) => assistant.id)).toEqual([
      'Forge',
      'manual-assistant',
      'Mira',
    ]);
  });

  it('renames legacy default folders to current assistant names', async () => {
    const { getAssistantSoulLibrary } = require('../assistant-soul');
    await writeAssistant(
      path.join(mockUserDataRoot, 'assistants'),
      'pragmatic-engineer',
      buildSoul('Legacy Forge', 'Legacy description', 'legacy voice', 'edited legacy soul'),
    );

    const library = await getAssistantSoulLibrary(true, {
      enabled: true,
      presetId: 'pragmatic-engineer',
      content: '',
    });

    expect(library.enabled).toBe(true);
    expect(library.activeId).toBe('Forge');
    expect(
      fs.existsSync(
        path.join(mockUserDataRoot, 'assistants', 'pragmatic-engineer'),
      ),
    ).toBe(false);
    await expect(
      fs.promises.readFile(
        path.join(mockUserDataRoot, 'assistants', 'Forge', 'SOUL.md'),
        'utf-8',
      ),
    ).resolves.toContain('edited legacy soul');
  });

  it('writes edited SOUL.md body while preserving front matter metadata', async () => {
    const { saveAssistantSoul } = require('../assistant-soul');

    const library = await saveAssistantSoul({
      enabled: true,
      activeId: 'Forge',
      assistant: {
        id: 'Forge',
        content: 'edited soul',
      },
    });

    expect(library.enabled).toBe(true);
    expect(library.activeId).toBe('Forge');
    await expect(
      fs.promises.readFile(
        path.join(mockUserDataRoot, 'assistants', 'Forge', 'SOUL.md'),
        'utf-8',
      ),
    ).resolves.toBe(`---
name: Forge
description: Pragmatic builder
voice-style: calm and direct
---
edited soul
`);
    expect(
      fs.existsSync(path.join(mockUserDataRoot, 'assistants', 'Forge', 'voice.json')),
    ).toBe(false);
  });

  it('resolves active assistant content from settings instead of an index file', async () => {
    const { getActiveAssistantSoul } = require('../assistant-soul');

    await expect(
      getActiveAssistantSoul({
        enabled: true,
        presetId: 'warm-companion',
        content: 'legacy content',
      }),
    ).resolves.toEqual({
      enabled: true,
      presetId: 'Mira',
      content: '# SOUL.md\n\nwarm soul',
    });
  });

  it('removes legacy voice.json files when seeding defaults', async () => {
    const { getAssistantSoulLibrary } = require('../assistant-soul');
    await writeAssistant(
      path.join(mockUserDataRoot, 'assistants'),
      'Forge',
      buildSoul('Forge', 'Edited description', 'edited voice', 'edited soul'),
      { voiceJson: true },
    );

    await getAssistantSoulLibrary(true);

    expect(
      fs.existsSync(path.join(mockUserDataRoot, 'assistants', 'Forge', 'voice.json')),
    ).toBe(false);
  });
});
