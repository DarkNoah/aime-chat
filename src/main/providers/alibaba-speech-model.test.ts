/** @jest-environment node */
import { AlibabaSpeechModel } from './alibaba-speech-model';

function wav() {
  // Stereo PCM, with an odd-sized ancillary chunk before the audio data.
  const audio = Buffer.alloc(54 + 96000);
  audio.write('RIFF');
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVE', 8);
  audio.write('fmt ', 12);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(2, 22);
  audio.writeUInt32LE(24000, 24);
  audio.writeUInt32LE(96000, 28);
  audio.writeUInt16LE(4, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('JUNK', 36);
  audio.writeUInt32LE(1, 40);
  audio.write('data', 46);
  audio.writeUInt32LE(96000, 50);
  return audio;
}

describe('Alibaba speech models', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const apiBase = 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1';
  const model = (modelId = 'qwen3-tts-flash', region = 'cn-beijing') =>
    new AlibabaSpeechModel({ modelId, region, apiBase, apiKey: 'test-key' });
  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status });
  const succeed = () => {
    fetchMock.mockResolvedValueOnce(
      json({ output: { audio: { url: 'https://signed.example/audio.wav' } } }),
    );
    fetchMock.mockResolvedValueOnce(new Response(wav()));
  };
  const input = () => JSON.parse(fetchMock.mock.calls[0][1].body).input;
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ['cn-beijing', 'dashscope'],
    ['ap-southeast-1', 'dashscope-intl'],
  ])(
    'uses the Qwen endpoint for %s and downloads without credentials',
    async (region, host) => {
      succeed();
      const result = await model('qwen3-tts-instruct-flash', region).doGenerate(
        {
          text: 'Hello',
          language: 'en',
          instructions: 'Speak warmly',
          outputFormat: 'wav',
        },
      );
      expect(fetchMock.mock.calls[0][0]).toBe(
        `https://${host}.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`,
      );
      expect(input()).toEqual({
        text: 'Hello',
        voice: 'Cherry',
        language_type: 'English',
        instructions: 'Speak warmly',
      });
      expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
      expect(result.audio).toEqual(wav());
      expect(result.providerMetadata).toEqual({
        alibaba: { duration: 1, sampleRate: 24000 },
      });
    },
  );

  it.each([
    ['qwen-audio-3.0-tts-plus', 'longanhuan_v3.6'],
    ['qwen-audio-3.0-tts-flash', 'longanhuan_v3.6'],
    ['cosyvoice-v3-plus', 'longanyang'],
    ['cosyvoice-v3-flash', 'longanyang'],
  ])('maps synthesis parameters for %s', async (id, voice) => {
    succeed();
    await model(id).doGenerate({
      text: '你好',
      language: 'Chinese',
      instructions: '你说话的情感是happy。',
      speed: 1.2,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${apiBase}/services/audio/tts/SpeechSynthesizer`,
    );
    expect(input()).toEqual({
      text: '你好',
      voice,
      format: 'wav',
      sample_rate: 24000,
      language_hints: ['zh'],
      instruction: '你说话的情感是happy。',
      rate: 1.2,
    });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
  });

  it.each([
    'cosyvoice-v3.5-plus',
    'cosyvoice-v3.5-flash',
    'qwen3-tts-vd-2026-01-26',
    'qwen3-tts-vc-2026-01-22',
  ])('%s requires an existing custom voice and accepts it', async (id) => {
    await expect(model(id).doGenerate({ text: 'Hello' })).rejects.toThrow(
      'custom voice ID',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    succeed();
    await model(id).doGenerate({ text: 'Hello', voice: 'my-enrolled-voice' });
    expect(input().voice).toBe('my-enrolled-voice');
  });

  it.each(['2.8-hd', '2.8-turbo', '02-hd', '02-turbo'])(
    'decodes Alibaba MiniMax %s hex and duration in milliseconds',
    async (version) => {
      fetchMock.mockResolvedValueOnce(
        json({
          output: {
            base_resp: { status_code: 0 },
            data: { audio: wav().toString('hex'), status: 2 },
            extra_info: { audio_length: 3528, audio_sample_rate: 24000 },
          },
        }),
      );
      const result = await model(`MiniMax/speech-${version}`).doGenerate({
        text: '你好',
        language: 'zh',
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${apiBase}/services/aigc/multimodal-generation/generation`,
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe(
        `MiniMax/speech-${version}`,
      );
      expect(input()).toEqual({
        text: '你好',
        voice_setting: { voice_id: 'male-qn-qingse', speed: 1 },
        audio_setting: { sample_rate: 24000, format: 'wav', channel: 1 },
        language_boost: 'Chinese',
        output_format: 'hex',
      });
      expect(result.audio).toEqual(wav());
      expect(result.providerMetadata?.alibaba.duration).toBe(3.528);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['qwen3-tts-flash', { text: ' ' }, 'empty'],
    ['qwen3-tts-flash', { text: 'a'.repeat(601) }, '600'],
    ['MiniMax/speech-2.8-hd', { text: 'a'.repeat(10000) }, '10000'],
    ['qwen3-tts-flash', { text: 'a', outputFormat: 'mp3' }, 'output format'],
    ['qwen3-tts-flash', { text: 'a', instructions: 'Warmly' }, 'instructions'],
    ['cosyvoice-v2', { text: 'a', instructions: 'Warmly' }, 'instructions'],
    [
      'MiniMax/speech-2.8-hd',
      { text: 'a', instructions: 'Warmly' },
      'instructions',
    ],
    [
      'cosyvoice-v3-flash',
      { text: 'a', instructions: '中'.repeat(51) },
      '100 characters',
    ],
    ['qwen3-tts-flash', { text: 'a', speed: 1.2 }, 'speed'],
    ['cosyvoice-v3-flash', { text: 'a', speed: 3 }, 'speed'],
    ['qwen3-tts-flash', { text: 'a', language: 'Thai' }, 'does not support'],
    [
      'qwen3-tts-flash',
      {
        text: 'a',
        providerOptions: { local: { ref_audio: '/tmp/audio.wav' } },
      },
      'existing voice ID',
    ],
  ])(
    'rejects unsupported input for %s before requesting',
    async (id, options, error) => {
      await expect(
        model(id as string).doGenerate(options as any),
      ).rejects.toThrow(error as string);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ code: 'InvalidApiKey', message: 'Invalid key' }, 'Invalid key'],
    [
      {
        output: {
          base_resp: { status_code: 1008, status_msg: 'Insufficient balance' },
        },
      },
      'Insufficient balance',
    ],
    [{ output: {} }, 'no audio URL'],
  ])('surfaces API failures', async (response, error) => {
    fetchMock.mockResolvedValueOnce(json(response));
    await expect(model().doGenerate({ text: 'Hello' })).rejects.toThrow(error);
  });

  it('rejects missing MiniMax audio instead of silently decoding', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ output: { data: { audio: 'not hex' } } }),
    );
    await expect(
      model('MiniMax/speech-2.8-hd').doGenerate({ text: 'Hello' }),
    ).rejects.toThrow('invalid hex');
  });
  it('reports failed audio downloads', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ output: { audio: { url: 'https://signed.example/audio' } } }),
    );
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(model().doGenerate({ text: 'Hello' })).rejects.toThrow(
      'download failed (HTTP 403)',
    );
  });
  it('rejects empty audio', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ output: { audio: { url: 'https://signed.example/audio' } } }),
    );
    fetchMock.mockResolvedValueOnce(new Response(''));
    await expect(model().doGenerate({ text: 'Hello' })).rejects.toThrow(
      'empty audio',
    );
  });
  it('does not start when cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      model().doGenerate({ text: 'Hello', abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('propagates cancellation while downloading', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(
      json({ output: { audio: { url: 'https://signed.example/audio' } } }),
    );
    fetchMock.mockImplementationOnce(async (_url, { signal }) => {
      controller.abort();
      signal.throwIfAborted();
    });
    await expect(
      model().doGenerate({ text: 'Hello', abortSignal: controller.signal }),
    ).rejects.toThrow();
  });
  it('rejects unavailable models and regions', () => {
    expect(() => model('unknown')).toThrow('not supported');
    expect(() => model('qwen3-tts-flash', 'us-east-1')).toThrow(
      'not supported',
    );
  });
});
