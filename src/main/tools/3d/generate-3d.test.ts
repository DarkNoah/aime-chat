/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import sharp from 'sharp';
import { setTimeout as delay } from 'timers/promises';
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { Alibaba3DModel } from '@/main/providers/alibaba-3d-model';
import { Generate3D } from './generate-3d';

jest.mock('@/main/providers', () => ({
  providersManager: { getProvider: jest.fn() },
}));
jest.mock('@/main/utils/file', () => ({ saveFile: jest.fn() }));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'model-id' }));
jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }));
jest.mock('@/types/tool', () => ({
  ToolConfig: { Generate3D: { configSchema: {} } },
}));

describe('Generate3D local image uploads', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const apiBase = 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1';
  const policy = {
    upload_host: 'https://temporary.oss-cn-beijing.aliyuncs.com',
    upload_dir: 'dashscope-instant/account/session',
    oss_access_key_id: 'upload-key',
    signature: 'signed',
    policy: 'policy-value',
    x_oss_object_acl: 'private',
    x_oss_forbid_overwrite: 'true',
    max_file_size_mb: 20,
  };
  let workspace: string;
  let png: Buffer;
  let context: any;
  let model: Alibaba3DModel;
  const tool = () => new Generate3D({ modelId: 'provider/Tripo/Tripo-P1.0' });
  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-3d-upload-'));
    png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await fs.writeFile(path.join(workspace, 'cat.png'), png);
    context = {
      requestContext: { get: () => workspace },
      abortSignal: new AbortController().signal,
    };
    model = new Alibaba3DModel({
      modelId: 'Tripo/Tripo-P1.0',
      region: 'cn-beijing',
      apiBase,
      apiKey: 'api-key',
    });
    (providersManager.getProvider as jest.Mock).mockResolvedValue({
      model3d: () => model,
    });
    (delay as jest.Mock).mockResolvedValue(undefined);
    (saveFile as jest.Mock).mockResolvedValue('/output/model.glb');
    fetchMock.mockImplementation(async (url, options) => {
      if (url.includes('/uploads?'))
        return new Response(JSON.stringify({ data: policy }));
      if (url === `${policy.upload_host}/`) return new Response('');
      if (options.method === 'POST')
        return new Response(
          JSON.stringify({
            output: { task_id: 'task', task_status: 'PENDING' },
          }),
        );
      if (url.includes('/tasks/'))
        return new Response(
          JSON.stringify({
            output: {
              task_id: 'task',
              task_status: 'SUCCEEDED',
              results: [{ pbr_model_url: 'https://cdn.example/model.glb' }],
            },
          }),
        );
      return new Response('glb');
    });
  });
  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each(['relative', 'absolute', 'file-url'])(
    'uploads a %s local image before single-image generation',
    async (kind) => {
      const file = path.join(workspace, 'cat.png');
      const sources = {
        relative: 'cat.png',
        absolute: file,
        'file-url': pathToFileURL(file).href,
      };
      await tool().execute({ images: [{ image: sources[kind] }] }, context);
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${apiBase}/uploads?action=getPolicy&model=Tripo%2FTripo-P1.0`,
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        'Bearer api-key',
      );
      const upload = fetchMock.mock.calls[1][1];
      expect(upload.headers).toBeUndefined();
      expect(upload.redirect).toBe('error');
      const form = upload.body as FormData;
      expect(Array.from(form.keys()).at(-1)).toBe('file');
      expect(form.get('x-oss-content-type')).toBe('image/png');
      expect(
        Buffer.from(await (form.get('file') as Blob).arrayBuffer()),
      ).toEqual(png);
      const create = fetchMock.mock.calls[2][1];
      expect(JSON.parse(create.body).input).toEqual({
        image: `oss://${form.get('key')}`,
      });
      expect(create.headers['X-DashScope-OssResourceResolve']).toBe('enable');
      expect(JSON.parse(create.body).parameters).toEqual({
        texture: true,
        pbr: true,
      });
    },
  );
  it('combines a local front image and a remote back image without changing URLs or view order', async () => {
    const remote = 'https://images.example/back.jpg?signature=test';
    await tool().execute(
      {
        images: [
          { view: 'back', image: remote },
          { view: 'front', image: 'cat.png' },
        ],
      },
      context,
    );
    const upload = fetchMock.mock.calls[1][1].body as FormData;
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).input.images).toEqual([
      { type: 'png', file_token: `oss://${upload.get('key')}` },
      {},
      { type: 'jpeg', file_token: remote },
      {},
    ]);
    expect(
      fetchMock.mock.calls.filter(([url]) => url.includes('/uploads?')),
    ).toHaveLength(1);
  });
  it('passes an existing OSS reference and sets the resolver header', async () => {
    await tool().execute(
      { images: [{ image: 'oss://dashscope-instant/existing/cat.png' }] },
      context,
    );
    expect(fetchMock.mock.calls[0][0]).toContain('/3d-generation');
    expect(
      fetchMock.mock.calls[0][1].headers['X-DashScope-OssResourceResolve'],
    ).toBe('enable');
  });
  it('validates all local files before uploading any', async () => {
    await fs.writeFile(path.join(workspace, 'invalid.png'), 'not an image');
    await expect(
      tool().execute(
        {
          images: [
            { view: 'front', image: 'cat.png' },
            { view: 'back', image: 'invalid.png' },
          ],
        },
        context,
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['directory', 'empty', 'oversized', 'dimensions', 'format'])(
    'rejects invalid local image: %s',
    async (kind) => {
      let image = 'bad.png';
      if (kind === 'directory') image = workspace;
      if (kind === 'empty') await fs.writeFile(path.join(workspace, image), '');
      if (kind === 'oversized') {
        await fs.writeFile(path.join(workspace, image), '');
        await fs.truncate(path.join(workspace, image), 20 * 1024 * 1024 + 1);
      }
      if (kind === 'dimensions')
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: 'red' },
        })
          .png()
          .toFile(path.join(workspace, image));
      if (kind === 'format')
        await sharp(png).webp().toFile(path.join(workspace, image));
      await expect(
        tool().execute({ images: [{ image }] }, context),
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('does not create a generation task when OSS upload fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: policy })))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(
      tool().execute({ images: [{ image: 'cat.png' }] }, context),
    ).rejects.toThrow('upload failed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('honors abort during upload and does not create a generation task', async () => {
    const controller = new AbortController();
    context.abortSignal = controller.signal;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: policy })))
      .mockImplementationOnce(async () => {
        controller.abort();
        return new Response('');
      });
    await expect(
      tool().execute({ images: [{ image: 'cat.png' }] }, context),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Generate3D', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const model = { doGenerate: jest.fn(), getTask: jest.fn() };
  const model3d = jest.fn();
  const context = { requestContext: { get: () => '/workspace' } } as any;
  const tool = () => new Generate3D({ modelId: 'provider/Tripo/Tripo-P1.0' });
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    model3d.mockReturnValue(model);
    (providersManager.getProvider as jest.Mock).mockResolvedValue({ model3d });
    model.doGenerate.mockResolvedValue({ taskId: 'task', status: 'queued' });
    model.getTask.mockResolvedValue({
      taskId: 'task',
      status: 'succeeded',
      results: [{ url: 'https://cdn.example/model.glb', format: 'glb' }],
    });
    fetchMock.mockImplementation(async () => new Response('model-bytes'));
    (saveFile as jest.Mock).mockImplementation(
      async (_bytes, file, workspace) => `${workspace}/${file}`,
    );
    (delay as jest.Mock).mockResolvedValue(undefined);
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('runs real adapter creation, polling and downloads in one call', async () => {
    model3d.mockReturnValueOnce(
      new Alibaba3DModel({
        modelId: 'Tripo/Tripo-P1.0',
        apiKey: 'key',
        region: 'cn-beijing',
        apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1',
      }),
    );
    for (const status of ['PENDING', 'RUNNING', 'SUCCEEDED'])
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_id: 'task',
              task_status: status,
              ...(status === 'SUCCEEDED'
                ? {
                    results: [
                      {
                        pbr_model_url: 'https://cdn.example/model.glb',
                        rendered_image_url: 'https://cdn.example/preview.webp',
                      },
                    ],
                  }
                : {}),
            },
          }),
        ),
      );
    fetchMock
      .mockResolvedValueOnce(new Response('glb'))
      .mockResolvedValueOnce(new Response('webp'));
    const result = await tool().execute({ prompt: 'Cat' }, context);
    expect(model3d).toHaveBeenCalledWith('Tripo/Tripo-P1.0');
    expect(result).toBe(
      '<file>/workspace/model-id.glb</file>\n<file>/workspace/model-id-preview.webp</file>',
    );
    expect(
      fetchMock.mock.calls.filter(([, options]) => options.method === 'POST'),
    ).toHaveLength(1);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(15000, undefined, { signal: undefined });
    expect(fetchMock.mock.calls[3][1].headers).toBeUndefined();
    expect(fetchMock.mock.calls[4][1].headers).toBeUndefined();
    expect(saveFile).toHaveBeenCalledWith(
      Buffer.from('glb'),
      'model-id.glb',
      '/workspace',
    );
  });
  it.each([
    { images: [{ image: 'https://images.example/cat.png' }] },
    {
      images: [
        { view: 'front', image: 'https://images.example/front.png' },
        { view: 'back', image: 'https://images.example/back.png' },
      ],
    },
  ])('passes image inputs and quality settings to the model', async (input) => {
    await tool().execute(
      {
        ...input,
        textured: false,
        texture_quality: 'detailed',
        save_path: 'cat.glb',
      } as any,
      context,
    );
    expect(model.doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        image: input.images.length === 1 ? input.images[0].image : undefined,
        images: input.images.length > 1 ? input.images : undefined,
        textured: true,
        textureQuality: 'detailed',
      }),
    );
    expect(saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'cat.glb',
      '/workspace',
    );
  });
  it.each([
    {},
    { prompt: 'Cat', images: [{ image: 'https://images.example/cat.png' }] },
    { images: [{ image: 'a' }, { image: 'b' }] },
    {
      images: [
        { view: 'front', image: 'a' },
        { view: 'front', image: 'b' },
      ],
    },
    { prompt: 'Cat', save_path: 'cat.obj' },
  ])('rejects invalid inputs before creating a task', async (input) => {
    await expect(tool().execute(input as any, context)).rejects.toThrow();
    expect(model.doGenerate).not.toHaveBeenCalled();
  });
  it('requires configuration and has no task_id input', async () => {
    expect(tool().inputSchema.shape).not.toHaveProperty('task_id');
    expect(tool().inputSchema.shape).not.toHaveProperty('image');
    expect(tool().inputSchema.shape).not.toHaveProperty('textured');
    await expect(new Generate3D().execute({ prompt: 'Cat' })).rejects.toThrow(
      'tool configuration',
    );
  });
  it('stops polling on abort without creating another task', async () => {
    const controller = new AbortController();
    (delay as jest.Mock).mockImplementationOnce(async () => {
      controller.abort();
    });
    await expect(
      tool().execute(
        { prompt: 'Cat' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
    expect(model.getTask).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });
  it.each(['failed', 'cancelled'])(
    'does not download a %s task',
    async (status) => {
      model.getTask.mockResolvedValueOnce({
        taskId: 'task',
        status,
        error: 'Task error',
      });
      await expect(tool().execute({ prompt: 'Cat' }, context)).rejects.toThrow(
        'Task error',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('keeps the saved model when the preview download fails', async () => {
    model.getTask.mockResolvedValueOnce({
      taskId: 'task',
      status: 'succeeded',
      results: [
        {
          url: 'https://cdn.example/model.glb',
          previewUrl: 'https://cdn.example/preview.webp',
        },
      ],
    });
    fetchMock
      .mockResolvedValueOnce(new Response('glb'))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const result = await tool().execute({ prompt: 'Cat' }, context);
    expect(result).toContain('<file>/workspace/model-id.glb</file>');
    expect(result).toContain('preview could not be saved');
  });
  it('does not save empty or failed model downloads', async () => {
    fetchMock.mockResolvedValueOnce(new Response(''));
    await expect(tool().execute({ prompt: 'Cat' }, context)).rejects.toThrow(
      'empty',
    );
    expect(saveFile).not.toHaveBeenCalled();
  });
  it('gives each result its own filename', async () => {
    model.getTask.mockResolvedValueOnce({
      taskId: 'task',
      status: 'succeeded',
      results: [1, 2].map(() => ({ url: 'https://cdn.example/model.glb' })),
    });
    const result = await tool().execute(
      { prompt: 'Cat', save_path: 'cat.glb' },
      context,
    );
    expect(result).toContain('cat-1.glb');
    expect(result).toContain('cat-2.glb');
  });
});
