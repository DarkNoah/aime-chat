import type {
  VideoGenerationOptions,
  VideoMediaUpload,
  VideoModel,
  VideoTask,
  VideoTaskStatus,
} from '@/types/video';

import { uploadToAlibabaOss } from './alibaba-file-upload';

const statuses: Record<string, VideoTaskStatus> = {
  PENDING: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'cancelled',
  UNKNOWN: 'failed',
};

export class WanVideoModel implements VideoModel {
  readonly provider = 'alibaba';

  readonly modelId: string;

  readonly pollingIntervalMs = 15_000;

  readonly localMedia = {
    image: {
      maxBytes: 20 * 1024 * 1024,
      mimeTypes: ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'],
    },
    video: {
      transport: 'upload' as const,
      maxBytes: 100 * 1024 * 1024,
      mimeTypes: ['video/mp4', 'video/quicktime'],
    },
    audio: {
      transport: 'upload' as const,
      maxBytes: 15 * 1024 * 1024,
      mimeTypes: ['audio/wav', 'audio/mp3', 'audio/mpeg'],
    },
  };

  private readonly apiBase: string;

  private readonly apiKey: string;

  constructor(options: { modelId: string; apiBase?: string; apiKey?: string }) {
    this.modelId = options.modelId;
    this.apiKey = options.apiKey;
    const base = options.apiBase?.trim();
    if (!base)
      throw new Error(
        'Set the Alibaba workspaceId and region in provider settings.',
      );
    const url = new URL(base);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /[{}]|%7[bd]/i.test(base)
    )
      throw new Error(
        'Invalid Alibaba video endpoint. Check workspaceId and region.',
      );
    if (/^dashscope(?:-intl)?\.aliyuncs\.com$/.test(url.hostname))
      throw new Error(
        'Wan 3.0 requires a workspace endpoint. Set workspaceId and region in Alibaba provider settings.',
      );
    const prefix = url.pathname
      .replace(/\/+$/, '')
      .replace(
        /\/(?:compatible-mode\/v1|api\/v1(?:\/services\/aigc\/video-generation\/video-synthesis)?)$/,
        '',
      );
    this.apiBase = `${url.origin}${prefix}/api/v1`;
  }

  private async request(
    endpoint: string,
    signal?: AbortSignal,
    body?: object,
    resolveOss = false,
  ) {
    if (!this.apiKey?.trim()) throw new Error('Alibaba API key is not set');
    signal?.throwIfAborted();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(body ? { 'X-DashScope-Async': 'enable' } : {}),
        ...(resolveOss ? { 'X-DashScope-OssResourceResolve': 'enable' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Wan video API returned an invalid response (HTTP ${response.status})`,
      );
    }
    if (!response.ok || data?.code)
      throw new Error(
        [data?.code, data?.message].filter(Boolean).join(': ') ||
          `Wan video API failed (HTTP ${response.status})`,
      );
    return data;
  }

  async uploadMedia({
    data,
    fileName,
    mimeType,
    abortSignal,
  }: VideoMediaUpload): Promise<string> {
    const rule = Object.values(this.localMedia).find((item) =>
      item.mimeTypes.includes(mimeType),
    );
    if (!rule || !data.byteLength || data.byteLength > rule.maxBytes)
      throw new Error('Invalid or oversized Wan upload file');
    const response = await this.request(
      `/uploads?action=getPolicy&model=${encodeURIComponent(this.modelId)}`,
      abortSignal,
    );
    return uploadToAlibabaOss(response?.data, {
      data,
      fileName,
      mimeType,
      abortSignal,
    });
  }

  private static parseTask(data: any, expectedTaskId?: string): VideoTask {
    const output = data?.output;
    if (typeof output?.task_id !== 'string' || !output.task_id)
      throw new Error('Wan video response is missing task_id');
    if (expectedTaskId && output.task_id !== expectedTaskId)
      throw new Error(
        'Wan video response task_id does not match the requested task',
      );
    const status = statuses[output.task_status];
    if (!status)
      throw new Error(`Unknown Wan video task status: ${output.task_status}`);
    if (
      status === 'succeeded' &&
      (typeof output.video_url !== 'string' ||
        !/^https?:\/\//i.test(output.video_url))
    )
      throw new Error('Wan video task succeeded without a valid download URL');
    return {
      taskId: output.task_id,
      status,
      ...(output.video_url ? { url: output.video_url } : {}),
      ...(status === 'failed' || status === 'cancelled'
        ? {
            error:
              [output.code, output.message].filter(Boolean).join(': ') ||
              (output.task_status === 'UNKNOWN'
                ? 'Task expired or does not exist'
                : `Task ${output.task_status}`),
          }
        : {}),
    };
  }

  async doGenerate(options: VideoGenerationOptions): Promise<VideoTask> {
    if (!['wan3.0-video', 'wan3.0-video-prime'].includes(this.modelId))
      throw new Error(`Unsupported Wan video model: ${this.modelId}`);
    const prompt = options.prompt?.trim();
    if (!prompt || Array.from(prompt).length > 20_000)
      throw new Error('Wan video prompt must contain 1–20000 characters');
    const duration = options.duration ?? 5;
    if (
      !Number.isInteger(duration) ||
      (duration !== -1 && (duration < 2 || duration > 30))
    )
      throw new Error(
        'Wan duration must be -1 (automatic) or an integer from 2 to 30 seconds',
      );
    const resolution = options.resolution ?? '1080P';
    if (!['480P', '720P', '1080P'].includes(resolution))
      throw new Error('Wan resolution must be 480P, 720P or 1080P');
    const ratio = options.aspectRatio ?? 'adaptive';
    if (!['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(ratio))
      throw new Error('Unsupported Wan aspect ratio');
    if (
      options.seed !== undefined &&
      (!Number.isInteger(options.seed) ||
        options.seed < -1 ||
        options.seed > 2147483647)
    )
      throw new Error('Wan seed must be an integer from -1 to 2147483647');
    const hasFrames = Boolean(options.firstFrame || options.lastFrame);
    if (options.lastFrame && !options.firstFrame)
      throw new Error('Wan last_frame requires first_frame');
    if (
      hasFrames &&
      (options.referenceImages?.length ||
        options.referenceVideos?.length ||
        options.referenceAudios?.length ||
        options.referenceFile ||
        options.referenceLink)
    )
      throw new Error(
        'First/last frames cannot be mixed with reference media, files or links',
      );
    if (options.referenceFile && options.referenceLink)
      throw new Error('reference_file and reference_link cannot be combined');
    if (
      (options.referenceImages?.length ?? 0) > 10 ||
      (options.referenceVideos?.length ?? 0) > 5 ||
      (options.referenceAudios?.length ?? 0) > 5
    )
      throw new Error(
        'Wan supports at most 10 reference images, 5 videos and 5 audio files',
      );
    const media: { type: string; url: string }[] = [];
    const addMedia = (type: string, value?: string) => {
      if (!value) return;
      const isImage = ['first_frame', 'last_frame', 'reference_image'].includes(
        type,
      );
      const dataImage =
        /^data:image\/(jpeg|png|bmp|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
          value,
        );
      if (!/^(https?:\/\/|oss:\/\/)/i.test(value) && !(isImage && dataImage))
        throw new Error(
          `Wan ${type} requires a public HTTP(S) URL or temporary OSS URL${isImage ? ' or a JPEG/PNG/BMP/WebP data URI' : ''}`,
        );
      if (
        dataImage &&
        Buffer.byteLength(dataImage[2], 'base64') >
          this.localMedia.image.maxBytes
      )
        throw new Error('Wan input image exceeds 20 MB');
      media.push({ type, url: value });
    };
    addMedia('first_frame', options.firstFrame);
    addMedia('last_frame', options.lastFrame);
    options.referenceImages?.forEach((url) => addMedia('reference_image', url));
    options.referenceVideos?.forEach((url) => addMedia('reference_video', url));
    options.referenceAudios?.forEach((url) => addMedia('reference_audio', url));
    addMedia('file', options.referenceFile);
    addMedia('link', options.referenceLink);
    return WanVideoModel.parseTask(
      await this.request(
        '/services/aigc/video-generation/video-synthesis',
        options.abortSignal,
        {
          model: this.modelId,
          input: { prompt, ...(media.length ? { media } : {}) },
          parameters: {
            duration,
            resolution,
            ratio,
            audio: options.audio ?? true,
            seed: options.seed ?? -1,
            prompt_extend: options.promptExtend ?? true,
            watermark: options.watermark ?? false,
          },
        },
        media.some(({ url }) => /^oss:\/\//i.test(url)),
      ),
    );
  }

  async getTask(
    taskId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<VideoTask> {
    if (!taskId?.trim()) throw new Error('Video task ID is required');
    return WanVideoModel.parseTask(
      await this.request(
        `/tasks/${encodeURIComponent(taskId)}`,
        options?.abortSignal,
      ),
      taskId,
    );
  }
}
