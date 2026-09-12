/** @jest-environment node */
import { setTimeout as delay } from 'timers/promises';
import { AlibabaTranscriptionModel } from './alibaba-transcription-model';

jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }));

describe('Alibaba transcription', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const apiBase = 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1';
  const createModel = (
    modelId = 'fun-asr',
    region = 'cn-beijing',
    apiKey = 'test-key',
  ) => new AlibabaTranscriptionModel({ modelId, region, apiBase, apiKey });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const input = { audio: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' };
  const source = 'https://example.com/audio.wav?signature=opaque';
  const task = (status: string, extra = {}) => ({
    output: { task_id: 'task-1', task_status: status, ...extra },
  });
  const result = {
    subtask_status: 'SUCCEEDED',
    transcription_url: 'https://results.example/transcript.json',
  };
  const transcript = {
    properties: { original_duration_in_milliseconds: 3000 },
    transcripts: [
      {
        channel_id: 0,
        text: 'Hello world.',
        sentences: [
          {
            text: 'Hello world.',
            language: 'en',
            begin_time: 250,
            end_time: 1500,
            words: [
              {
                text: 'Hello',
                begin_time: 250,
                end_time: 750,
                punctuation: '',
              },
              {
                text: ' world',
                begin_time: 750,
                end_time: 1500,
                punctuation: '.',
              },
            ],
          },
        ],
      },
    ],
  };
  const policy = {
    upload_dir: 'temporary/model',
    upload_host: 'https://upload.example.com',
    oss_access_key_id: 'oss-key',
    signature: 'signature',
    policy: 'policy',
    x_oss_object_acl: 'private',
    x_oss_forbid_overwrite: 'true',
    max_file_size_mb: 1024,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = fetchMock;
    (delay as jest.Mock).mockResolvedValue(undefined);
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    'qwen-audio-3.0-asr-flash-filetrans',
    'fun-asr',
    'fun-asr-mtl',
    'paraformer-v2',
    'paraformer-mtl-v1',
  ])('runs creation, polling and result retrieval for %s', async (modelId) => {
    fetchMock
      .mockResolvedValueOnce(json(task('PENDING')))
      .mockResolvedValueOnce(json(task('RUNNING')))
      .mockResolvedValueOnce(json(task('SUCCEEDED', { results: [result] })))
      .mockResolvedValueOnce(json(transcript));
    const output = await createModel(modelId).doGenerateFromUrl({
      url: source,
    });
    expect(output).toMatchObject({
      text: 'Hello world.',
      durationInSeconds: 3,
      language: 'en',
      segments: [
        { text: 'Hello', startSecond: 0.25, endSecond: 0.75 },
        { text: ' world.', startSecond: 0.75, endSecond: 1.5 },
      ],
    });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiBase}/services/audio/asr/transcription`);
    expect(JSON.parse(request.body)).toEqual({
      model: modelId,
      input: { file_urls: [source] },
      parameters: { channel_id: [0] },
    });
    expect(request.headers['X-DashScope-Async']).toBe('enable');
    expect(request.headers['X-DashScope-OssResourceResolve']).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe(`${apiBase}/tasks/task-1`);
    expect(fetchMock.mock.calls[3][1].headers).toBeUndefined();
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it('uses the singular Qwen Filetrans request and result fields', async () => {
    fetchMock
      .mockResolvedValueOnce(json(task('PENDING')))
      .mockResolvedValueOnce(
        json({
          ...task('SUCCEEDED', {
            result: { transcription_url: result.transcription_url },
          }),
          usage: { seconds: 4 },
        }),
      )
      .mockResolvedValueOnce(json({ transcripts: transcript.transcripts }));
    const output = await createModel(
      'qwen3-asr-flash-filetrans',
    ).doGenerateFromUrl({ url: source });
    expect(output.durationInSeconds).toBe(4);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'qwen3-asr-flash-filetrans',
      input: { file_url: source },
      parameters: { channel_id: [0], enable_itn: false, enable_words: true },
    });
  });

  it.each(['fun-asr', 'qwen3-asr-flash-filetrans'])(
    'uploads local audio with the same model and resolves OSS for %s',
    async (modelId) => {
      const completed = modelId.startsWith('qwen3')
        ? { result: { transcription_url: result.transcription_url } }
        : { results: [result] };
      fetchMock
        .mockResolvedValueOnce(json({ data: policy }))
        .mockResolvedValueOnce(new Response(''))
        .mockResolvedValueOnce(json(task('SUCCEEDED', completed)))
        .mockResolvedValueOnce(json(transcript));
      await createModel(modelId).doGenerate(input);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${apiBase}/uploads?action=getPolicy&model=${modelId}`,
      );
      const upload = fetchMock.mock.calls[1][1];
      expect(upload.headers).toBeUndefined();
      expect([...upload.body.keys()].pop()).toBe('file');
      expect(Buffer.from(await upload.body.get('file').arrayBuffer())).toEqual(
        Buffer.from(input.audio),
      );
      const request = fetchMock.mock.calls[2][1];
      expect(request.headers['X-DashScope-OssResourceResolve']).toBe('enable');
      expect(JSON.stringify(JSON.parse(request.body).input)).toContain(
        'oss://temporary/model/',
      );
      expect(upload.redirect).toBe('error');
    },
  );

  it.each(['qwen-audio-3.0-asr-flash', 'fun-asr-flash-2026-06-15'])(
    'uses Base64 and normalizes synchronous Flash timestamps for %s',
    async (modelId) => {
      fetchMock.mockResolvedValueOnce(
        json({
          output: {
            text: 'Hello world.',
            sentence: transcript.transcripts[0].sentences[0],
          },
          usage: { duration: 3 },
        }),
      );
      const output = await createModel(modelId).doGenerate(input);
      expect(output.segments[0].startSecond).toBe(0.25);
      expect(output.durationInSeconds).toBe(3);
      const request = fetchMock.mock.calls[0][1];
      expect(JSON.parse(request.body)).toEqual({
        model: modelId,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: { data: 'data:audio/wav;base64,AQID' },
                },
              ],
            },
          ],
        },
        parameters: { format: 'wav' },
      });
      expect(request.headers['X-DashScope-SSE']).toBe('disable');
      expect(request.headers['X-DashScope-Async']).toBeUndefined();
    },
  );

  it('accepts the nested Flash response from the user guide', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        output: {
          text: 'Hello world.',
          output: { sentence: transcript.transcripts[0].sentences[0] },
        },
      }),
    );
    expect(
      (await createModel('qwen-audio-3.0-asr-flash').doGenerate(input))
        .segments,
    ).toHaveLength(2);
  });

  it('uploads synchronous audio when Base64 would exceed the 10 MB limit', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: policy }))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(
        json({
          output: {
            choices: [{ message: { content: [{ text: 'Recognized' }] } }],
          },
        }),
      );
    await createModel('qwen3-asr-flash').doGenerate({
      ...input,
      audio: new Uint8Array(8 * 1024 * 1024),
    });
    const request = fetchMock.mock.calls[2][1];
    expect(request.headers['X-DashScope-OssResourceResolve']).toBe('enable');
    expect(JSON.parse(request.body).input.messages[0].content[0].audio).toMatch(
      /^oss:\/\//,
    );
  });

  it('does not invent timestamps or duration for text-only Qwen Flash', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        output: {
          choices: [
            {
              message: {
                content: [{ text: '你好' }],
                annotations: [{ type: 'audio_info', language: 'zh' }],
              },
            },
          ],
        },
      }),
    );
    const output = await createModel('qwen3-asr-flash').doGenerate({
      ...input,
      audio: 'AQID',
    });
    expect(output).toMatchObject({
      text: '你好',
      language: 'zh',
      segments: [],
    });
    expect(output.durationInSeconds).toBeUndefined();
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).input.messages[0].content,
    ).toEqual([{ audio: 'data:audio/wav;base64,AQID' }]);
  });

  it('only uses direct Flash URLs when their audio format is known', () => {
    expect(
      createModel('fun-asr-flash-2026-06-15').canGenerateFromUrl(source),
    ).toBe(true);
    expect(
      createModel('fun-asr-flash-2026-06-15').canGenerateFromUrl(
        'https://example.com/download?id=1',
      ),
    ).toBe(false);
    expect(
      createModel().canGenerateFromUrl('https://example.com/download?id=1'),
    ).toBe(true);
  });

  it.each(['FAILED', 'CANCELED', 'UNKNOWN', 'MALFORMED'])(
    'terminates on %s without fetching a transcript',
    async (status) => {
      fetchMock.mockResolvedValueOnce(json(task(status)));
      await expect(
        createModel().doGenerateFromUrl({ url: source }),
      ).rejects.toThrow(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects failed subtasks even if the parent task succeeded', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        task('SUCCEEDED', {
          results: [
            {
              subtask_status: 'FAILED',
              code: 'InvalidFile',
              message: 'Download failed',
            },
          ],
        }),
      ),
    );
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow('InvalidFile: Download failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ output: { task_status: 'PENDING' } }, 'missing task_id'],
    [task('SUCCEEDED', { results: [] }), 'missing the file result'],
    [
      task('SUCCEEDED', {
        results: [{ ...result, transcription_url: 'file:///private/data' }],
      }),
      'URL is invalid',
    ],
  ])('rejects incomplete task responses', async (body, message) => {
    fetchMock.mockResolvedValueOnce(json(body));
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow(message);
  });

  it('rejects a mismatched poll task ID', async () => {
    fetchMock
      .mockResolvedValueOnce(json(task('PENDING')))
      .mockResolvedValueOnce(
        json({ output: { task_id: 'other', task_status: 'SUCCEEDED' } }),
      );
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow('does not match');
  });

  it.each([
    [{}, 'result is invalid'],
    [{ transcripts: [{ text: 'hello' }] }, 'invalid channels'],
    [
      {
        transcripts: [
          {
            text: 'hello',
            sentences: [{ text: 'hello', begin_time: 20, end_time: 10 }],
          },
        ],
      },
      'invalid timestamps',
    ],
  ])('rejects malformed transcript JSON', async (body, message) => {
    fetchMock
      .mockResolvedValueOnce(json(task('SUCCEEDED', { results: [result] })))
      .mockResolvedValueOnce(json(body));
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow(message);
  });

  it('falls back to sentence timestamps when words are absent', async () => {
    fetchMock
      .mockResolvedValueOnce(json(task('SUCCEEDED', { results: [result] })))
      .mockResolvedValueOnce(
        json({
          transcripts: [
            {
              text: 'Hi',
              sentences: [{ text: 'Hi', begin_time: 100, end_time: 500 }],
            },
          ],
        }),
      );
    expect(
      (await createModel().doGenerateFromUrl({ url: source })).segments,
    ).toEqual([{ text: 'Hi', startSecond: 0.1, endSecond: 0.5 }]);
  });

  it('propagates API error codes', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ code: 'InvalidApiKey', message: 'Denied' }, 401),
    );
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow('InvalidApiKey: Denied');
  });

  it('reports invalid JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Bad gateway', { status: 502 }),
    );
    await expect(
      createModel().doGenerateFromUrl({ url: source }),
    ).rejects.toThrow('HTTP 502');
  });

  it('stops polling on cancellation without attempting remote deletion', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(json(task('PENDING')));
    (delay as jest.Mock).mockImplementationOnce(
      async (_ms, _value, options) => {
        controller.abort();
        options.signal.throwIfAborted();
      },
    );
    await expect(
      createModel().doGenerateFromUrl({
        url: source,
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ audio: new Uint8Array() }, { mediaType: 'audio/invalid' }])(
    'validates local audio before upload',
    async (options) => {
      await expect(
        createModel().doGenerate({ ...input, ...options }),
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects unknown models and unsupported regions', () => {
    expect(() => createModel('unknown')).toThrow('not supported');
    expect(() => createModel('paraformer-v2', 'ap-southeast-1')).toThrow(
      'not supported',
    );
    expect(() => createModel('qwen3-asr-flash-us', 'us-east-1')).not.toThrow();
  });
});
