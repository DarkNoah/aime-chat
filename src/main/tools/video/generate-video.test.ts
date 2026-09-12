/** @jest-environment node */
import { setTimeout as delay } from 'timers/promises';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { MiniMaxVideoModel } from '@/main/providers/minimax-video-model';
import { WanVideoModel } from '@/main/providers/wan-video-model';
import { GenerateVideo } from './generate-video';

jest.mock('@/main/app', () => ({
  appManager: { getInfo: jest.fn(), toast: jest.fn() },
}));
jest.mock('@/main/providers', () => ({
  providersManager: { getProvider: jest.fn() },
}));
jest.mock('@/main/utils/file', () => ({ saveFile: jest.fn() }));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'video-id' }));
jest.mock('timers/promises', () => ({ setTimeout: jest.fn() }));
jest.mock('@/types/tool', () => ({
  ToolConfig: { GenerateVideo: { configSchema: {} } },
}));

describe('GenerateVideo', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const model = { doGenerate: jest.fn(), getTask: jest.fn() };
  const videoModel = jest.fn(() => model);
  const context = { requestContext: { get: () => '/workspace' } } as any;
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    (appManager.getInfo as jest.Mock).mockResolvedValue({
      defaultModel: { generateVideoModel: 'default/MiniMax-H3' },
    });
    (providersManager.getProvider as jest.Mock).mockResolvedValue({
      videoModel,
    });
    model.doGenerate.mockResolvedValue({ taskId: 'task-1', status: 'queued' });
    model.getTask.mockResolvedValue({
      taskId: 'task-1',
      status: 'succeeded',
      url: 'https://example.com/out.mp4',
    });
    fetchMock.mockResolvedValue(new Response('mp4-content'));
    (saveFile as jest.Mock).mockResolvedValue('/workspace/video.mp4');
    (delay as jest.Mock).mockResolvedValue(undefined);
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([
    'audio',
    'watermark',
    'seed',
    'prompt_extend',
    'reference_file',
    'reference_link',
  ])('does not expose %s in the tool schema', (parameter) => {
    expect(new GenerateVideo().inputSchema.shape).not.toHaveProperty(parameter);
  });

  it('runs Wan creation, polling and download in one invocation', async () => {
    const wan = new WanVideoModel({
      modelId: 'wan3.0-video',
      apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com',
      apiKey: 'test',
    });
    videoModel.mockReturnValueOnce(wan as any);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: { task_id: 'wan-task', task_status: 'PENDING' },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: { task_id: 'wan-task', task_status: 'RUNNING' },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_id: 'wan-task',
              task_status: 'SUCCEEDED',
              video_url: 'https://example.com/wan.mp4',
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('wan-video'));
    await expect(
      new GenerateVideo({ modelId: 'alibaba/wan3.0-video' }).execute(
        {
          prompt: 'Move',
          duration: -1,
          reference_link: 'https://example.com/brief',
          reference_file: 'https://example.com/brief.pdf',
          audio: false,
          watermark: true,
          seed: 42,
          prompt_extend: false,
        } as any,
        context,
      ),
    ).resolves.toBe('<file>/workspace/video.mp4</file>');
    expect(
      fetchMock.mock.calls.filter(([, request]) => request?.method === 'POST'),
    ).toHaveLength(1);
    expect(delay).toHaveBeenCalledWith(15000, undefined, { signal: undefined });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      input: { prompt: 'Move' },
      parameters: {
        duration: -1,
        audio: true,
        watermark: false,
        seed: -1,
        prompt_extend: true,
      },
    });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).input.media,
    ).toBeUndefined();
    expect(saveFile).toHaveBeenCalledWith(
      Buffer.from('wan-video'),
      'video-id.mp4',
      '/workspace',
    );
  });

  it('uploads local Wan video/audio, converts images to Base64, and preserves URLs', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'aime-wan-media-'),
    );
    const wan = new WanVideoModel({
      modelId: 'wan3.0-video',
      apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com',
      apiKey: 'test',
    });
    const upload = jest
      .spyOn(wan, 'uploadMedia')
      .mockImplementation(
        async ({ fileName }) => `oss://temporary/${fileName}`,
      );
    const generate = jest.spyOn(wan, 'doGenerate').mockResolvedValue({
      taskId: 'wan-task',
      status: 'succeeded',
      url: 'https://example.com/result.mp4',
    });
    videoModel.mockReturnValueOnce(wan as any);
    try {
      await Promise.all(
        ['image.png', 'clip.mov', 'sound.mp3'].map((name) =>
          fs.writeFile(path.join(directory, name), `content:${name}`),
        ),
      );
      await new GenerateVideo().execute(
        {
          prompt: 'Reference',
          reference_images: ['image.png', 'https://example.com/image.png'],
          reference_videos: ['clip.mov', 'https://example.com/video.mp4'],
          reference_audios: ['sound.mp3', 'oss://existing/audio'],
        },
        { requestContext: { get: () => directory } } as any,
      );
      expect(upload).toHaveBeenCalledTimes(2);
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'clip.mov',
          mimeType: 'video/quicktime',
          data: Buffer.from('content:clip.mov'),
        }),
      );
      expect(upload).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'sound.mp3',
          mimeType: 'audio/mp3',
        }),
      );
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImages: [
            `data:image/png;base64,${Buffer.from('content:image.png').toString('base64')}`,
            'https://example.com/image.png',
          ],
          referenceVideos: [
            'oss://temporary/clip.mov',
            'https://example.com/video.mp4',
          ],
          referenceAudios: [
            'oss://temporary/sound.mp3',
            'oss://existing/audio',
          ],
        }),
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('uploads unsupported Wan audio Data URIs and stops before generation if upload fails', async () => {
    const wan = new WanVideoModel({
      modelId: 'wan3.0-video',
      apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com',
      apiKey: 'test',
    });
    const upload = jest
      .spyOn(wan, 'uploadMedia')
      .mockRejectedValue(new Error('Upload failed'));
    const generate = jest.spyOn(wan, 'doGenerate');
    videoModel.mockReturnValueOnce(wan as any);
    await expect(
      new GenerateVideo().execute(
        {
          prompt: 'Move',
          reference_audios: ['data:audio/wav;base64,YXVkaW8='],
        },
        context,
      ),
    ).rejects.toThrow('Upload failed');
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        data: Buffer.from('audio'),
        mimeType: 'audio/wav',
      }),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('uploads MiniMax local media while preserving existing URLs and Data URIs', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'aime-minimax-media-'),
    );
    const minimax = new MiniMaxVideoModel({
      modelId: 'MiniMax-H3',
      apiBase: 'https://api.minimax.cn/v1',
      apiKey: 'test',
    });
    const upload = jest
      .spyOn(minimax, 'uploadMedia')
      .mockImplementation(async ({ fileName }) => `mm_file://${fileName}`);
    const generate = jest.spyOn(minimax, 'doGenerate').mockResolvedValue({
      taskId: 'task-1',
      status: 'succeeded',
      url: 'https://example.com/video.mp4',
    });
    videoModel.mockReturnValueOnce(minimax as any);
    try {
      await Promise.all(
        ['image.png', 'clip.mov', 'sound.wav'].map((name) =>
          fs.writeFile(path.join(directory, name), name),
        ),
      );
      await new GenerateVideo().execute(
        {
          prompt: 'Move',
          reference_images: ['image.png', 'data:image/png;base64,AA=='],
          reference_videos: ['clip.mov', 'https://example.com/reference.mp4'],
          reference_audios: ['sound.wav'],
        },
        { requestContext: { get: () => directory } } as any,
      );
      expect(upload).toHaveBeenCalledTimes(3);
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImages: [
            'mm_file://image.png',
            'data:image/png;base64,AA==',
          ],
          referenceVideos: [
            'mm_file://clip.mov',
            'https://example.com/reference.mp4',
          ],
          referenceAudios: ['mm_file://sound.wav'],
        }),
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('cancels a stopped task using a fresh signal and surfaces provider confirmation', async () => {
    const controller = new AbortController();
    const cancelTask = jest.fn().mockImplementation(async (_id, options) => {
      expect(options.abortSignal.aborted).toBe(false);
      return { cancelled: true };
    });
    videoModel.mockReturnValueOnce({ ...model, cancelTask } as any);
    model.getTask.mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(cancelTask).toHaveBeenCalledTimes(1);
    expect(cancelTask).toHaveBeenCalledWith('task-1', {
      abortSignal: expect.any(AbortSignal),
    });
    expect(appManager.toast).toHaveBeenCalledWith(
      'Video task task-1 cancelled',
      { type: 'success' },
    );
  });

  it('reports when a running task cannot be cancelled', async () => {
    const controller = new AbortController();
    const cancelTask = jest.fn().mockResolvedValue({
      cancelled: false,
      message: 'MiniMax task is running and cannot be cancelled',
    });
    videoModel.mockReturnValueOnce({ ...model, cancelTask } as any);
    model.getTask.mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(appManager.toast).toHaveBeenCalledWith(
      'MiniMax task is running and cannot be cancelled',
      undefined,
    );
  });

  it('reports cancellation failure without retrying or creating a new task', async () => {
    const controller = new AbortController();
    const cancelTask = jest
      .fn()
      .mockRejectedValue(new Error('Provider unavailable'));
    videoModel.mockReturnValueOnce({ ...model, cancelTask } as any);
    model.getTask.mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(cancelTask).toHaveBeenCalledTimes(1);
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
    expect(appManager.toast).toHaveBeenCalledWith(
      expect.stringContaining('Provider unavailable'),
      { type: 'error' },
    );
  });

  it('does not cancel or delete a completed task when download is stopped', async () => {
    const controller = new AbortController();
    const cancelTask = jest.fn();
    videoModel.mockReturnValueOnce({ ...model, cancelTask } as any);
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(cancelTask).not.toHaveBeenCalled();
  });

  it('uses the default video model, saves in the workspace and returns a file tag', async () => {
    const result = await new GenerateVideo().execute(
      { prompt: 'Move', save_path: 'video.mp4' },
      context,
    );
    expect(providersManager.getProvider).toHaveBeenCalledWith('default');
    expect(videoModel).toHaveBeenCalledWith('MiniMax-H3');
    expect(model.doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Move' }),
    );
    expect(saveFile).toHaveBeenCalledWith(
      Buffer.from('mp4-content'),
      'video.mp4',
      '/workspace',
    );
    expect(result).toContain('<file>/workspace/video.mp4</file>');
  });

  it('prefers the configured model and preserves slashes in the model ID', async () => {
    await new GenerateVideo({ modelId: 'configured/vendor/video' }).execute({
      prompt: 'Move',
    });
    expect(providersManager.getProvider).toHaveBeenCalledWith('configured');
    expect(videoModel).toHaveBeenCalledWith('vendor/video');
    expect(saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'video-id.mp4',
      undefined,
    );
  });

  it('requires a prompt and does not expose task continuation inputs', () => {
    const schema = new GenerateVideo().inputSchema;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.shape).not.toHaveProperty('task_id');
    expect(schema.shape).not.toHaveProperty('model_id');
  });

  it('waits through queued/running states without creating a second task', async () => {
    model.getTask.mockResolvedValueOnce({
      taskId: 'task-1',
      status: 'running',
    });
    await new GenerateVideo().execute({ prompt: 'Move' }, context);
    expect(delay).toHaveBeenCalledTimes(1);
    expect(model.getTask).toHaveBeenCalledTimes(2);
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
  });

  it.each(['failed', 'cancelled'])(
    'does not download a %s task',
    async (status) => {
      model.getTask.mockResolvedValueOnce({
        taskId: 'task-1',
        status,
        error: 'provider reason',
      });
      await expect(
        new GenerateVideo().execute({ prompt: 'Move' }, context),
      ).rejects.toThrow(`Video generation ${status}: provider reason`);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(saveFile).not.toHaveBeenCalled();
    },
  );

  it('keeps the same invocation waiting beyond 60 seconds and returns only the file', async () => {
    jest.useFakeTimers();
    // Model timeout signals on the fake clock so this catches an overall wait deadline.
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
          milliseconds,
        );
        return controller.signal;
      });
    try {
      for (let index = 0; index < 20; index += 1) {
        model.getTask.mockResolvedValueOnce({
          taskId: 'task-1',
          status: 'running',
        });
      }
      (delay as jest.Mock).mockImplementation(
        async (milliseconds, _value, options) => {
          jest.advanceTimersByTime(milliseconds);
          options.signal?.throwIfAborted();
        },
      );
      const result = await new GenerateVideo().execute(
        { prompt: 'Move' },
        context,
      );
      expect(result).toBe('<file>/workspace/video.mp4</file>');
      expect(delay).toHaveBeenCalledTimes(20);
      expect(model.getTask).toHaveBeenCalledTimes(21);
      expect(model.doGenerate).toHaveBeenCalledTimes(1);
      expect(model.getTask.mock.calls.every(([id]) => id === 'task-1')).toBe(
        true,
      );
    } finally {
      timeout.mockRestore();
      jest.useRealTimers();
    }
  });

  it('reports query and download errors without resubmitting generation', async () => {
    model.getTask.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(
      new GenerateVideo().execute({ prompt: 'Move' }, context),
    ).rejects.toThrow('network unavailable');
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      new Response('unavailable', { status: 503 }),
    );
    await expect(
      new GenerateVideo().execute({ prompt: 'Move' }, context),
    ).rejects.toThrow('HTTP 503');
    expect(model.doGenerate).toHaveBeenCalledTimes(2);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('rejects a missing model without submitting', async () => {
    (appManager.getInfo as jest.Mock).mockResolvedValue({ defaultModel: {} });
    await expect(
      new GenerateVideo().execute({ prompt: 'Move' }),
    ).rejects.toThrow('Video model is not set');
    expect(model.doGenerate).not.toHaveBeenCalled();
  });

  it('honors cancellation before submitting a generation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(model.doGenerate).not.toHaveBeenCalled();
  });

  it('converts a workspace-relative local frame to a data URI', async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'aime-video-test-'),
    );
    try {
      await fs.writeFile(
        path.join(directory, 'frame.png'),
        Buffer.from('frame-bytes'),
      );
      await new GenerateVideo().execute(
        { prompt: 'Move', first_frame: 'frame.png' },
        { requestContext: { get: () => directory } } as any,
      );
      expect(model.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          firstFrame: `data:image/png;base64,${Buffer.from('frame-bytes').toString('base64')}`,
        }),
      );
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('reports a save failure without returning a file or creating another task', async () => {
    (saveFile as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move', save_path: 'chosen.mp4' },
        context,
      ),
    ).rejects.toThrow('disk full');
    expect(saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'chosen.mp4',
      '/workspace',
    );
    expect(model.doGenerate).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the user cancels during the wait', async () => {
    const controller = new AbortController();
    model.getTask.mockResolvedValueOnce({
      taskId: 'task-1',
      status: 'running',
    });
    (delay as jest.Mock).mockImplementationOnce(
      async (_milliseconds, _value, options) => {
        controller.abort();
        options.signal.throwIfAborted();
      },
    );
    await expect(
      new GenerateVideo().execute(
        { prompt: 'Move' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(model.getTask).toHaveBeenCalledTimes(1);
    expect(model.getTask).toHaveBeenCalledWith('task-1', {
      abortSignal: controller.signal,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
