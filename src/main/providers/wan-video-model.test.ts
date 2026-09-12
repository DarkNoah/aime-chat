/** @jest-environment node */
import { WanVideoModel } from './wan-video-model';

const base = 'https://workspace.cn-beijing.maas.aliyuncs.com';
const createModel = (apiBase = base, modelId = 'wan3.0-video') =>
  new WanVideoModel({ apiBase, modelId, apiKey: 'test-key' });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const pending = { output: { task_id: 'task-1', task_status: 'PENDING' } };

describe('WanVideoModel', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    '',
    '/api/v1/',
    '/compatible-mode/v1',
    '/api/v1/services/aigc/video-generation/video-synthesis',
  ])('creates an async task using endpoint suffix %s', async (suffix) => {
    mockFetch.mockResolvedValue(json(pending));
    await expect(
      createModel(base + suffix).doGenerate({ prompt: 'Move' }),
    ).resolves.toEqual({ taskId: 'task-1', status: 'queued' });
    const [url, request] = mockFetch.mock.calls[0];
    expect(url).toBe(
      `${base}/api/v1/services/aigc/video-generation/video-synthesis`,
    );
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'X-DashScope-Async': 'enable',
    });
    expect(JSON.parse(request.body)).toEqual({
      model: 'wan3.0-video',
      input: { prompt: 'Move' },
      parameters: {
        duration: 5,
        resolution: '1080P',
        ratio: 'adaptive',
        audio: true,
        seed: -1,
        prompt_extend: true,
        watermark: false,
      },
    });
  });

  it('preserves custom gateway paths and maps reference media and options for Prime', async () => {
    mockFetch.mockResolvedValue(json(pending));
    await createModel(
      'https://gateway.example/wan/api/v1',
      'wan3.0-video-prime',
    ).doGenerate({
      prompt: 'Edit video',
      referenceImages: ['data:image/png;base64,AA=='],
      referenceVideos: ['https://example.com/video.mp4'],
      referenceAudios: ['https://example.com/audio.wav'],
      referenceFile: 'https://example.com/brief.pdf',
      duration: -1,
      resolution: '720P',
      aspectRatio: '9:16',
      audio: false,
      seed: 12,
      promptExtend: false,
      watermark: true,
    });
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://gateway.example/wan/api/v1/services/aigc/video-generation/video-synthesis',
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('wan3.0-video-prime');
    expect(body.input.media.map((m: any) => m.type)).toEqual([
      'reference_image',
      'reference_video',
      'reference_audio',
      'file',
    ]);
    expect(body.parameters).toEqual({
      duration: -1,
      resolution: '720P',
      ratio: '9:16',
      audio: false,
      seed: 12,
      prompt_extend: false,
      watermark: true,
    });
  });

  it('maps first and last frames', async () => {
    mockFetch.mockResolvedValue(json(pending));
    await createModel().doGenerate({
      prompt: 'Move',
      firstFrame: 'https://example.com/first.png',
      lastFrame: 'https://example.com/last.png',
    });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).input.media).toEqual([
      { type: 'first_frame', url: 'https://example.com/first.png' },
      { type: 'last_frame', url: 'https://example.com/last.png' },
    ]);
  });

  it.each([
    [{ duration: 31 }, 'duration'],
    [{ duration: 0 }, 'duration'],
    [{ resolution: '2K' }, 'resolution'],
    [{ aspectRatio: '21:9' }, 'aspect ratio'],
    [{ seed: -2 }, 'seed'],
    [{ lastFrame: 'https://example.com/image.png' }, 'requires first_frame'],
    [
      {
        firstFrame: 'https://example.com/image.png',
        referenceAudios: ['https://example.com/a.mp3'],
      },
      'cannot be mixed',
    ],
    [
      {
        referenceFile: 'https://example.com/a.pdf',
        referenceLink: 'https://example.com',
      },
      'cannot be combined',
    ],
    [
      { referenceImages: Array(11).fill('https://example.com/a.png') },
      'at most',
    ],
    [{ referenceVideos: ['data:video/mp4;base64,AA=='] }, 'public HTTP'],
    [{ referenceAudios: ['mm_file://a'] }, 'public HTTP'],
    [{ referenceImages: ['data:image/heic;base64,AA=='] }, 'public HTTP'],
  ])(
    'rejects invalid input before creating a task: %j',
    async (options, message) => {
      await expect(
        createModel().doGenerate({ prompt: 'Move', ...options }),
      ).rejects.toThrow(message as string);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com',
    '',
  ])('requires a configured workspace endpoint: %s', (apiBase) => {
    expect(() => createModel(apiBase)).toThrow();
  });

  it.each([
    ['PENDING', 'queued'],
    ['RUNNING', 'running'],
    ['FAILED', 'failed'],
    ['CANCELED', 'cancelled'],
    ['UNKNOWN', 'failed'],
  ])('maps task state %s to %s', async (state, expected) => {
    mockFetch.mockResolvedValue(
      json({
        output: {
          task_id: 'task-1',
          task_status: state,
          code: state === 'FAILED' ? 'BadInput' : undefined,
          message: state === 'FAILED' ? 'Rejected' : undefined,
        },
      }),
    );
    const result = await createModel().getTask('task-1');
    expect(result.status).toBe(expected);
    const errors = {
      FAILED: 'BadInput: Rejected',
      UNKNOWN: 'Task expired or does not exist',
      CANCELED: 'Task CANCELED',
    };
    expect(result.error).toBe(errors[state]);
    expect(mockFetch.mock.calls[0][0]).toBe(`${base}/api/v1/tasks/task-1`);
    expect(
      mockFetch.mock.calls[0][1].headers['X-DashScope-Async'],
    ).toBeUndefined();
  });

  it('returns the successful video URL', async () => {
    mockFetch.mockResolvedValue(
      json({
        output: {
          task_id: 'task-1',
          task_status: 'SUCCEEDED',
          video_url: 'https://example.com/out.mp4',
        },
      }),
    );
    await expect(createModel().getTask('task-1')).resolves.toEqual({
      taskId: 'task-1',
      status: 'succeeded',
      url: 'https://example.com/out.mp4',
    });
  });

  it.each([
    [{ code: 'InvalidApiKey', message: 'Wrong region' }, 'Wrong region'],
    [{ output: { task_status: 'PENDING' } }, 'missing task_id'],
    [
      { output: { task_id: 'other', task_status: 'PENDING' } },
      'does not match',
    ],
    [
      { output: { task_id: 'task-1', task_status: 'SUCCEEDED' } },
      'download URL',
    ],
    [{ output: { task_id: 'task-1', task_status: 'UNEXPECTED' } }, 'Unknown'],
  ])(
    'rejects API errors or malformed responses: %j',
    async (response, message) => {
      mockFetch.mockResolvedValue(json(response));
      await expect(createModel().getTask('task-1')).rejects.toThrow(message);
    },
  );

  it('handles non-JSON errors and aborts without submitting another task', async () => {
    mockFetch.mockResolvedValue(new Response('bad gateway', { status: 502 }));
    await expect(createModel().getTask('task-1')).rejects.toThrow('HTTP 502');
    mockFetch.mockClear();
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
