/** @jest-environment node */
import { Alibaba3DModel } from './alibaba-3d-model';

describe('Alibaba Tripo 3D', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const apiBase = 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1';
  const model = (modelId = 'Tripo/Tripo-P1.0', region = 'cn-beijing') =>
    new Alibaba3DModel({ modelId, region, apiBase, apiKey: 'key' });
  const json = (value: object, status = 200) =>
    new Response(JSON.stringify(value), { status });
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    fetchMock.mockImplementation(async () =>
      json({ output: { task_id: 'task', task_status: 'PENDING' } }),
    );
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  const body = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it('creates a text task with the workspace endpoint and async header', async () => {
    expect(await model().doGenerate({ prompt: '一只猫' })).toEqual({
      taskId: 'task',
      status: 'queued',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${apiBase}/services/aigc/video-generation/3d-generation`,
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer key',
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    });
    expect(body()).toEqual({
      model: 'Tripo/Tripo-P1.0',
      input: { prompt: '一只猫' },
      parameters: { texture: true, pbr: true },
    });
  });
  it('passes a signed single-image URL unchanged and disables both material flags', async () => {
    const image = 'https://images.example/cat.png?signature=abc';
    await model().doGenerate({ image, textured: false });
    expect(body().input).toEqual({ image });
    expect(body().parameters).toEqual({ texture: false, pbr: false });
  });
  it('maps named views to front/left/back/right and leaves empty slots', async () => {
    await model('Tripo/Tripo-H3.1').doGenerate({
      images: [
        { view: 'back', image: 'https://images.example/back.JPG?token=x' },
        {
          view: 'front',
          image: 'https://images.example/download?id=1',
          format: 'png',
        },
      ],
      geometryQuality: 'ultra',
      textureQuality: 'detailed',
    });
    expect(body().input.images).toEqual([
      { type: 'png', file_token: 'https://images.example/download?id=1' },
      {},
      { type: 'jpeg', file_token: 'https://images.example/back.JPG?token=x' },
      {},
    ]);
    expect(body().parameters).toEqual({
      texture: true,
      pbr: true,
      geometry_quality: 'ultra',
      texture_quality: 'detailed',
    });
  });
  it('preserves all four views', async () => {
    await model().doGenerate({
      images: ['right', 'back', 'left', 'front'].map((view) => ({
        view,
        image: `https://images.example/${view}.png`,
      })) as any,
    });
    expect(body().input.images.map((image) => image.file_token)).toEqual(
      ['front', 'left', 'back', 'right'].map(
        (view) => `https://images.example/${view}.png`,
      ),
    );
  });
  it.each([
    [{}, 'exactly one'],
    [{ prompt: 'Cat', image: 'https://images.example/a.png' }, 'exactly one'],
    [{ prompt: '' }, '1–1024'],
    [{ prompt: '🐈'.repeat(1025) }, '1–1024'],
    [{ image: '/tmp/cat.png' }, 'public HTTP'],
    [{ image: 'data:image/png;base64,aA==' }, 'public HTTP'],
    [{ image: 'https://images.example/cat.webp' }, 'JPEG and PNG'],
    [
      { images: [{ view: 'front', image: 'https://images.example/cat.png' }] },
      '2–4',
    ],
    [
      {
        images: [
          { view: 'front', image: 'https://images.example/1.png' },
          { view: 'front', image: 'https://images.example/2.png' },
        ],
      },
      'distinct',
    ],
    [
      {
        images: [
          { view: 'front', image: 'https://images.example/download' },
          { view: 'left', image: 'https://images.example/2.png' },
        ],
      },
      'Specify image format',
    ],
    [
      {
        images: [
          {
            view: 'front',
            image: 'https://images.example/1.png',
            format: 'jpeg',
          },
          { view: 'left', image: 'https://images.example/2.png' },
        ],
      },
      'does not match',
    ],
    [{ prompt: 'Cat', geometryQuality: 'standard' }, 'H3.1'],
  ])(
    'rejects invalid generation input before making a request',
    async (options, error) => {
      await expect(model().doGenerate(options as any)).rejects.toThrow(
        error as string,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('counts Unicode prompt characters, not UTF-16 code units', async () => {
    await model().doGenerate({ prompt: '🐈'.repeat(1024) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['pbr_model_url', 'base_model_url'])(
    'normalizes successful %s results',
    async (field) => {
      fetchMock.mockResolvedValueOnce(
        json({
          output: {
            task_id: 'task',
            task_status: 'SUCCEEDED',
            results: [
              {
                [field]: 'https://cdn.example/model.glb',
                rendered_image_url: 'https://cdn.example/preview.webp',
              },
            ],
          },
        }),
      );
      expect(await model().getTask('task')).toEqual({
        taskId: 'task',
        status: 'succeeded',
        results: [
          {
            url: 'https://cdn.example/model.glb',
            format: 'glb',
            previewUrl: 'https://cdn.example/preview.webp',
          },
        ],
      });
      expect(fetchMock.mock.calls[0][0]).toBe(`${apiBase}/tasks/task`);
      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    },
  );
  it.each([
    ['RUNNING', 'running'],
    ['FAILED', 'failed'],
    ['CANCELED', 'cancelled'],
  ])('maps %s status', async (status, normalized) => {
    fetchMock.mockResolvedValueOnce(
      json({
        output: {
          task_id: 'task',
          task_status: status,
          code: 'Detail',
          message: 'Task detail',
        },
      }),
    );
    expect(await model().getTask('task')).toEqual({
      taskId: 'task',
      status: normalized,
      error: 'Detail: Task detail',
    });
  });
  it.each([
    [{ code: 'InvalidApiKey', message: 'Bad key' }, 'Bad key'],
    [{ output: { task_status: 'PENDING' } }, 'no task ID'],
    [
      { output: { task_id: 'task', task_status: 'UNKNOWN' } },
      'unknown or expired',
    ],
    [
      { output: { task_id: 'task', task_status: 'SUCCEEDED', results: [] } },
      'without model results',
    ],
    [
      { output: { task_id: 'other', task_status: 'RUNNING' } },
      'different task ID',
    ],
  ])('reports malformed/failed query responses', async (response, error) => {
    fetchMock.mockResolvedValueOnce(json(response));
    await expect(model().getTask('task')).rejects.toThrow(error);
  });
  it('does not start when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      model().doGenerate({ prompt: 'Cat', abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('limits Tripo to the documented models and region', () => {
    expect(() => model('Tripo/Tripo-P1.0', 'ap-southeast-1')).toThrow(
      'not supported',
    );
    expect(() => model('Tripo/unknown')).toThrow('not supported');
  });
});
