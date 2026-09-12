/** @jest-environment node */
import { MiniMaxMusicModel } from './minimax-music-model';

describe('MiniMax music', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const createModel = (modelId = 'music-3.0') =>
    new MiniMaxMusicModel({
      modelId,
      provider: { apiKey: 'test-key' } as any,
      apiBase: 'https://gateway.example/minimax/v1/',
    });
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { audio: 'https://cdn.example/music.mp3', status: 2 },
          base_resp: { status_code: 0 },
        }),
      ),
    );
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each(['music-3.0', 'music-2.6'])(
    'requests a completed URL and automatic lyrics for %s',
    async (modelId) => {
      await expect(
        createModel(modelId).doGenerate({ prompt: '温柔的民谣' }),
      ).resolves.toBe('https://cdn.example/music.mp3');
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe('https://gateway.example/minimax/v1/music_generation');
      expect(request.headers.Authorization).toBe('Bearer test-key');
      expect(JSON.parse(request.body)).toEqual({
        model: modelId,
        prompt: '温柔的民谣',
        stream: false,
        output_format: 'url',
        lyrics_optimizer: true,
        is_instrumental: false,
        audio_setting: { sample_rate: 44100, format: 'mp3' },
      });
    },
  );

  it('preserves supplied lyrics without generating new lyrics', async () => {
    await createModel().doGenerate({
      prompt: '民谣',
      lyrics: '[Verse]\n清风吹过',
      format: 'wav',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      lyrics: '[Verse]\n清风吹过',
      lyrics_optimizer: false,
      audio_setting: { format: 'wav' },
    });
  });

  it('generates instrumental music without automatic lyrics', async () => {
    await createModel().doGenerate({ prompt: '钢琴曲', is_instrumental: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.is_instrumental).toBe(true);
    expect(body.lyrics_optimizer).toBe(false);
    expect(body.lyrics).toBeUndefined();
  });

  it.each([
    { prompt: ' ' },
    { prompt: 'x'.repeat(2001) },
    { lyrics: 'x'.repeat(3501) },
    { sample_rate: 1 },
    { format: 'bad' as any },
  ])('rejects invalid input before generation', async (options) => {
    await expect(
      createModel().doGenerate({ prompt: 'Music', ...options }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects retired or incompatible model IDs', async () => {
    await expect(
      createModel('music-2.5').doGenerate({ prompt: 'Music' }),
    ).rejects.toThrow('music-3.0 or music-2.6');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      { base_resp: { status_code: 1008, status_msg: 'Insufficient balance' } },
      200,
      'Insufficient balance',
    ],
    [{ error: { message: 'Unauthorized' } }, 401, 'Unauthorized'],
    [{ data: { audio: 'aabbcc', status: 2 } }, 200, 'completed audio URL'],
    [
      { data: { audio: 'https://cdn.example/audio', status: 1 } },
      200,
      'completed audio URL',
    ],
  ])(
    'rejects failed or incomplete generation',
    async (body, status, message) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), { status }),
      );
      await expect(
        createModel().doGenerate({ prompt: 'Music' }),
      ).rejects.toThrow(message);
    },
  );

  it('reports non-JSON API errors', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await expect(createModel().doGenerate({ prompt: 'Music' })).rejects.toThrow(
      'HTTP 502',
    );
  });

  it('does not start a request after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createModel().doGenerate({
        prompt: 'Music',
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
