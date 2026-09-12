/** @jest-environment node */
import { MiniMaxVideoModel } from './minimax-video-model';

describe('MiniMaxVideoModel', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  const createModel = (
    modelId = 'MiniMax-H3',
    apiBase = 'https://api.minimax.cn/v1/',
  ) => new MiniMaxVideoModel({ modelId, apiBase, apiKey: 'test-key' });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('rejects unsupported Wan-only options instead of silently ignoring them', async () => {
    await expect(
      createModel().doGenerate({ prompt: 'Move', audio: false }),
    ).rejects.toThrow('does not support');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('creates V2 text-to-video with provider auth and valid defaults', async () => {
    mockFetch.mockResolvedValue(json({ task_id: 'task-1' }));
    await expect(
      createModel().doGenerate({ prompt: 'A moving cloud' }),
    ).resolves.toEqual({ taskId: 'task-1', status: 'queued' });
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.minimax.cn/v2/video_generation');
    expect(request.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body)).toEqual({
      model: 'MiniMax-H3',
      content: [{ type: 'text', text: 'A moving cloud' }],
      resolution: '768P',
      duration: 5,
      ratio: '16:9',
    });
  });

  it('preserves a custom gateway prefix and maps first/last frames to adaptive', async () => {
    mockFetch.mockResolvedValue(json({ task_id: 'task-2' }));
    await createModel(
      'MiniMax-H3',
      'https://gateway.example/minimax/v2',
    ).doGenerate({
      prompt: 'Move',
      firstFrame: 'https://example.com/start.png',
      lastFrame: 'data:image/png;base64,AA==',
      aspectRatio: '9:16',
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://gateway.example/minimax/v2/video_generation',
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.ratio).toBe('adaptive');
    expect(body.content.slice(1)).toEqual([
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/start.png' },
        role: 'first_frame',
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,AA==' },
        role: 'last_frame',
      },
    ]);
  });

  it('maps multimodal references to the documented nested URL objects', async () => {
    mockFetch.mockResolvedValue(json({ task_id: 'task-3' }));
    await createModel().doGenerate({
      prompt: 'Reference',
      referenceImages: ['mm_file://image'],
      referenceVideos: ['https://example.com/video.mp4'],
      referenceAudios: ['https://example.com/audio.mp3'],
      resolution: '2K',
      duration: 15,
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.content).toContainEqual({
      type: 'video_url',
      video_url: { url: 'https://example.com/video.mp4' },
      role: 'reference_video',
    });
    expect(body.content).toContainEqual({
      type: 'audio_url',
      audio_url: { url: 'https://example.com/audio.mp3' },
      role: 'reference_audio',
    });
  });

  it.each([
    ['MiniMax-H3', { duration: 3 }],
    ['MiniMax-H3', { duration: 5.5 }],
    ['MiniMax-H3', { resolution: '480P' }],
    ['MiniMax-H3-Max', { resolution: '2K' }],
    ['MiniMax-H3-Max', { duration: 4 }],
    ['MiniMax-H3-Max', { referenceImages: ['https://example.com/a.png'] }],
    [
      'MiniMax-H3',
      {
        firstFrame: 'https://example.com/a.png',
        referenceAudios: ['https://example.com/a.mp3'],
      },
    ],
    ['MiniMax-H3', { aspectRatio: 'adaptive' }],
    ['MiniMax-H3', { prompt: ' ' }],
    ['MiniMax-H3', { firstFrame: '/tmp/not-a-url.png' }],
    ['unknown', {}],
  ])(
    'rejects unsupported %s options before a paid request: %j',
    async (modelId, options) => {
      await expect(
        createModel(modelId).doGenerate({ prompt: 'Move', ...options }),
      ).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each(['queued', 'running', 'failed', 'cancelled', 'succeeded'])(
    'normalizes the %s task status',
    async (status) => {
      mockFetch.mockResolvedValue(
        json({
          task: {
            id: 'task-1',
            status,
            content: { url: 'https://example.com/out.mp4' },
            error: { message: 'failure detail' },
          },
        }),
      );
      await expect(createModel().getTask('task-1')).resolves.toMatchObject({
        taskId: 'task-1',
        status,
        url: 'https://example.com/out.mp4',
        error: 'failure detail',
      });
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.minimax.cn/v2/query/video_generation/task-1',
      );
    },
  );

  it.each([
    { task: { id: 'other', status: 'running' } },
    { task: { id: 'task-1', status: 'succeeded' } },
    { task: { id: 'task-1', status: 'unexpected' } },
  ])('rejects malformed query responses: %j', async (body) => {
    mockFetch.mockResolvedValue(json(body));
    await expect(createModel().getTask('task-1')).rejects.toThrow();
  });

  it('surfaces HTTP and API errors without assuming success', async () => {
    mockFetch.mockResolvedValueOnce(
      json({ error: { message: 'insufficient balance' } }, 402),
    );
    await expect(createModel().doGenerate({ prompt: 'Move' })).rejects.toThrow(
      'insufficient balance',
    );
    mockFetch.mockResolvedValueOnce(
      new Response('gateway error', { status: 502 }),
    );
    await expect(createModel().getTask('task-1')).rejects.toThrow('HTTP 502');
    mockFetch.mockResolvedValueOnce(json({}));
    await expect(createModel().doGenerate({ prompt: 'Move' })).rejects.toThrow(
      'task_id',
    );
  });

  it('does not submit an already-aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createModel().doGenerate({
        prompt: 'Move',
        abortSignal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
