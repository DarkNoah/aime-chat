/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { MiniMaxMusicModel } from '@/main/providers/minimax-music-model';
import { MusicGeneration } from './music-generation';

jest.mock('@/main/providers', () => ({
  providersManager: { getProvider: jest.fn() },
}));
jest.mock('@/main/utils/file', () => ({ saveFile: jest.fn() }));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'music-id' }));
jest.mock('@/types/tool', () => ({
  ToolConfig: { MusicGeneration: { configSchema: {} } },
}));

describe('MusicGeneration', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const doGenerate = jest.fn();
  const musicModel = jest.fn(() => ({ doGenerate }));
  const context = { requestContext: { get: () => '/workspace' } } as any;
  const tool = () => new MusicGeneration({ modelId: 'minimax/music-3.0' });
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock;
    (providersManager.getProvider as jest.Mock).mockResolvedValue({
      musicModel,
    });
    musicModel.mockReturnValue({ doGenerate });
    doGenerate.mockResolvedValue('https://cdn.example/music.mp3');
    fetchMock.mockResolvedValue(new Response('audio-data'));
    (saveFile as jest.Mock).mockResolvedValue('/workspace/music.mp3');
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('runs MiniMax generation, downloads the result and saves a file', async () => {
    musicModel.mockReturnValueOnce(
      new MiniMaxMusicModel({
        modelId: 'music-3.0',
        provider: { apiKey: 'test' } as any,
        apiBase: 'https://api.minimax.cn/v1',
      }) as any,
    );
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { audio: 'https://cdn.example/music.mp3', status: 2 },
            base_resp: { status_code: 0 },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('real-audio-bytes'));
    await expect(
      tool().execute({ prompt: '民谣' }, context),
    ).resolves.toContain('<file>/workspace/music.mp3</file>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example/music.mp3');
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
    expect(saveFile).toHaveBeenCalledWith(
      Buffer.from('real-audio-bytes'),
      'music-id.mp3',
      '/workspace',
    );
  });

  it('forwards lyrics, instrumental selection, format and cancellation', async () => {
    const controller = new AbortController();
    await tool().execute(
      {
        prompt: 'Music',
        lyrics: 'words',
        is_instrumental: false,
        format: 'wav',
        save_path: 'song.wav',
      },
      { ...context, abortSignal: controller.signal },
    );
    expect(doGenerate).toHaveBeenCalledWith({
      prompt: 'Music',
      lyrics: 'words',
      is_instrumental: false,
      format: 'wav',
      abortSignal: controller.signal,
    });
    expect(saveFile).toHaveBeenCalledWith(
      Buffer.from('audio-data'),
      'song.wav',
      '/workspace',
    );
  });

  it('can save providers returning a local file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-music-'));
    try {
      const file = path.join(dir, 'music.mp3');
      await fs.writeFile(file, 'local-audio');
      doGenerate.mockResolvedValue(file);
      await tool().execute({ prompt: 'Music' }, context);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saveFile).toHaveBeenCalledWith(
        Buffer.from('local-audio'),
        'music-id.mp3',
        '/workspace',
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('requires a model selected in the tool configuration', async () => {
    await expect(
      new MusicGeneration().execute({ prompt: 'Music' }),
    ).rejects.toThrow('tool configuration');
    expect(providersManager.getProvider).not.toHaveBeenCalled();
  });

  it.each([undefined, {}])(
    'reports missing provider capabilities',
    async (provider) => {
      (providersManager.getProvider as jest.Mock).mockResolvedValue(provider);
      await expect(tool().execute({ prompt: 'Music' })).rejects.toThrow();
      expect(saveFile).not.toHaveBeenCalled();
    },
  );

  it.each(['', 'aabbcc', undefined])(
    'rejects invalid provider results',
    async (result) => {
      doGenerate.mockResolvedValue(result);
      await expect(tool().execute({ prompt: 'Music' })).rejects.toThrow();
      expect(saveFile).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['', 200, 'empty'],
    ['Not found', 404, 'HTTP 404'],
  ])(
    'does not save empty or failed downloads',
    async (body, status, message) => {
      fetchMock.mockResolvedValue(new Response(body, { status }));
      await expect(tool().execute({ prompt: 'Music' })).rejects.toThrow(
        message,
      );
      expect(saveFile).not.toHaveBeenCalled();
    },
  );

  it('stops before downloading when cancelled after generation', async () => {
    const controller = new AbortController();
    doGenerate.mockImplementation(async () => {
      controller.abort();
      return 'https://cdn.example/music.mp3';
    });
    await expect(
      tool().execute(
        { prompt: 'Music' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
