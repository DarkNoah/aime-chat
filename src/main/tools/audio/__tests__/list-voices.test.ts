import fs from 'fs';
import os from 'os';
import path from 'path';

let mockUserDataRoot = '';

jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return mockUserDataRoot;
      return path.join(mockUserDataRoot, name);
    },
  },
}));

jest.mock('@/main/utils/file', () => ({
  downloadFile: jest.fn(),
  saveFile: jest.fn(),
}));

jest.mock('@/utils/nanoid', () => ({
  nanoid: jest.fn(() => 'test-id'),
}));

jest.mock('@/main/providers', () => ({
  providersManager: {
    getProvider: jest.fn(),
  },
}));

jest.mock('@/main/app', () => ({
  appManager: {
    getInfo: jest.fn(),
  },
}));

describe('ListVoices', () => {
  beforeEach(async () => {
    jest.resetModules();
    mockUserDataRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'aime-chat-voices-'),
    );
  });

  it('lists only complete voice folders from user data voices directory', async () => {
    const voicesRoot = path.join(mockUserDataRoot, 'voices');
    await fs.promises.mkdir(path.join(voicesRoot, 'voice-a'), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(voicesRoot, 'voice-a', 'audio.wav'),
      'audio',
    );
    await fs.promises.writeFile(
      path.join(voicesRoot, 'voice-a', 'audio.txt'),
      'hello voice',
      'utf-8',
    );

    await fs.promises.mkdir(path.join(voicesRoot, 'missing-text'), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(voicesRoot, 'missing-text', 'audio.wav'),
      'audio',
    );

    await fs.promises.mkdir(path.join(voicesRoot, 'missing-audio'), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(voicesRoot, 'missing-audio', 'audio.txt'),
      'missing audio',
      'utf-8',
    );

    const { ListVoices } = await import('../index');
    const result = await new ListVoices().execute({});

    expect(result).toEqual({
      voicesPath: voicesRoot,
      voices: [
        {
          id: 'voice-a',
          audioPath: path.join(voicesRoot, 'voice-a', 'audio.wav'),
          text: 'hello voice',
        },
      ],
    });
  });

  it('returns an empty list when the user data voices directory does not exist', async () => {
    const { ListVoices } = await import('../index');
    const voicesRoot = path.join(mockUserDataRoot, 'voices');

    await expect(new ListVoices().execute({})).resolves.toEqual({
      voicesPath: voicesRoot,
      voices: [],
    });
  });
});
