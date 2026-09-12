/** @jest-environment node */
import { MiniMaxTranscriptionModel } from './minimax-transcription-model';

describe('MiniMax transcription', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const createModel = (modelId = 'asr-1.0', apiKey = 'test-key') =>
    new MiniMaxTranscriptionModel({
      modelId,
      provider: { apiKey } as any,
      apiBase: 'https://gateway.example/minimax/v2/',
    });
  const input = { audio: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' };
  const transcript = {
    text: '你好。',
    duration: 2.5,
    n_speakers: 1,
    segments: [{ id: 0, start: 0.25, end: 2, speaker: 'S1', text: '你好。' }],
  };
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    fetchMock.mockResolvedValue(new Response(JSON.stringify(transcript)));
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends multipart ASR and maps timestamps in seconds', async () => {
    const result = await createModel().doGenerate({
      ...input,
      headers: { 'Content-Type': 'application/json' },
      providerOptions: { minimax: { language: 'zh', timestampLevel: 'word' } },
    });
    expect(result).toMatchObject({
      text: '你好。',
      durationInSeconds: 2.5,
      segments: [{ text: '你好。', startSecond: 0.25, endSecond: 2 }],
    });
    expect(result.language).toBeUndefined();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gateway.example/minimax/v1/speech_to_text');
    expect(request.headers.get('Authorization')).toBe('Bearer test-key');
    expect(request.headers.get('language')).toBe('zh');
    expect(request.headers.has('Content-Type')).toBe(false);
    expect(Object.fromEntries(request.body.entries())).toMatchObject({
      model: 'asr-1.0',
      response_format: 'verbose_json',
      timestamp_level: 'word',
      stream: 'false',
    });
    expect(request.body.has('language')).toBe(false);
    const file = request.body.get('file');
    expect(file.name).toBe('audio.wav');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(
      Buffer.from(input.audio),
    );
  });

  it('accepts base64 audio with matching file type and automatic language', async () => {
    await createModel().doGenerate({ audio: 'AQID', mediaType: 'audio/mpeg' });
    const request = fetchMock.mock.calls[0][1];
    expect(request.body.get('file').name).toBe('audio.mp3');
    expect(request.body.get('timestamp_level')).toBe('sentence');
    expect(request.headers.has('language')).toBe(false);
  });

  it('honors the existing subtitle tool word timestamp option', async () => {
    await createModel().doGenerate({
      ...input,
      providerOptions: { openai: { timestampGranularities: ['word'] } },
    });
    expect(fetchMock.mock.calls[0][1].body.get('timestamp_level')).toBe('word');
  });

  it.each([
    { audio: new Uint8Array() },
    { audio: new Uint8Array(50 * 1024 * 1024 + 1) },
    { mediaType: 'audio/pcm' },
    { providerOptions: { minimax: { language: 1 } } },
    { providerOptions: { minimax: { timestampLevel: 'invalid' } } },
  ])('rejects invalid input before uploading', async (options) => {
    await expect(
      createModel().doGenerate({ ...input, ...options }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', 'test-key'],
    ['asr-1.0', ''],
  ])('rejects model/key %s', async (modelId, apiKey) => {
    await expect(
      createModel(modelId, apiKey).doGenerate(input),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: { message: 'Invalid API key' } }, 401, 'Invalid API key'],
    [
      { base_resp: { status_code: 1008, status_msg: 'Balance insufficient' } },
      200,
      'Balance insufficient',
    ],
    [{ text: 'Missing timestamps' }, 200, 'invalid transcript'],
    [
      { ...transcript, segments: [{ text: 'bad', start: 2, end: 1 }] },
      200,
      'invalid timestamps',
    ],
  ])(
    'reports API and malformed transcript errors',
    async (body, status, message) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(body), { status }),
      );
      await expect(createModel().doGenerate(input)).rejects.toThrow(message);
    },
  );

  it('reports non-JSON failures', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await expect(createModel().doGenerate(input)).rejects.toThrow('HTTP 502');
  });

  it('propagates cancellation during upload', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, request) => {
      controller.abort();
      request.signal.throwIfAborted();
    });
    await expect(
      createModel().doGenerate({ ...input, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
