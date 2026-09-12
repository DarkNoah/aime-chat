import type {
  VideoGenerationOptions,
  VideoMediaUpload,
  VideoModel,
  VideoTask,
  VideoTaskStatus,
} from '@/types/video';

import path from 'path';

const statuses: VideoTaskStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
];
const ratios = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

export class MiniMaxVideoModel implements VideoModel {
  readonly provider = 'minimax';

  readonly modelId: string;

  readonly localMedia = {
    image: {
      transport: 'upload' as const,
      supportsBase64: true,
      maxBytes: 30 * 1024 * 1024,
      mimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
      ],
    },
    video: {
      transport: 'upload' as const,
      supportsBase64: true,
      maxBytes: 50 * 1024 * 1024,
      mimeTypes: ['video/mp4', 'video/quicktime'],
    },
    audio: {
      transport: 'upload' as const,
      supportsBase64: true,
      maxBytes: 15 * 1024 * 1024,
      mimeTypes: ['audio/wav', 'audio/mp3'],
    },
  };

  private readonly apiBase: string;

  private readonly apiKey: string;

  constructor(options: { modelId: string; apiBase: string; apiKey: string }) {
    this.modelId = options.modelId;
    // Existing MiniMax providers use /v1; video generation uses /v2.
    this.apiBase = `${options.apiBase.replace(/\/+$/, '').replace(/\/v[12]$/, '')}/v2`;
    this.apiKey = options.apiKey;
  }

  private async request(
    endpoint: string,
    signal?: AbortSignal,
    body?: object | FormData,
    method?: 'DELETE',
    apiBase = this.apiBase,
  ) {
    if (!this.apiKey?.trim()) throw new Error('MiniMax API key is not set');
    signal?.throwIfAborted();
    const multipart = body instanceof FormData;
    let requestBody: string | FormData;
    if (body instanceof FormData) requestBody = body;
    else if (body) requestBody = JSON.stringify(body);
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: method || (body ? 'POST' : 'GET'),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
      },
      body: requestBody,
      signal: signal
        ? AbortSignal.any([
            signal,
            AbortSignal.timeout(multipart ? 120_000 : 30_000),
          ])
        : AbortSignal.timeout(multipart ? 120_000 : 30_000),
    });
    let data;
    try {
      // Preserve int64 upload IDs even when the API emits them as JSON numbers.
      data = multipart
        ? JSON.parse(
            (await response.text()).replace(
              /("file_id"\s*:\s*)(\d+)(?=\s*[,}])/g,
              '$1"$2"',
            ),
          )
        : await response.json();
    } catch {
      throw new Error(
        `MiniMax video API returned an invalid response (HTTP ${response.status})`,
      );
    }
    if (!response.ok || data?.error || data?.base_resp?.status_code) {
      throw new Error(
        data?.error?.message ||
          data?.base_resp?.status_msg ||
          `MiniMax video API failed (HTTP ${response.status})`,
      );
    }
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
      throw new Error('Invalid or oversized MiniMax upload file');
    const form = new FormData();
    form.append('purpose', 'video_generation_input');
    form.append(
      'file',
      new Blob([Uint8Array.from(data)], { type: mimeType }),
      path.basename(fileName),
    );
    const response = await this.request(
      '/files/upload',
      abortSignal,
      form,
      undefined,
      this.apiBase.replace(/\/v2$/, '/v1'),
    );
    const fileId = response?.file?.file_id;
    if (typeof fileId !== 'string' || !fileId.trim())
      throw new Error('MiniMax upload response is missing file_id');
    return `mm_file://${fileId}`;
  }

  async cancelTask(taskId: string, options?: { abortSignal?: AbortSignal }) {
    // DELETE also removes finished records; recheck state before attempting cancellation.
    const task = await this.getTask(taskId, options);
    if (task.status === 'cancelled') return { cancelled: true };
    if (task.status !== 'queued')
      return {
        cancelled: false,
        message: `MiniMax task ${taskId} is ${task.status}; only queued tasks can be cancelled.`,
      };
    const result = await this.request(
      `/video_generation/${encodeURIComponent(taskId)}`,
      options?.abortSignal,
      undefined,
      'DELETE',
    );
    if (
      result?.task_id !== taskId ||
      result?.action !== 'cancelled' ||
      result?.status !== 'cancelled'
    )
      throw new Error(
        `MiniMax did not confirm cancellation for task ${taskId} (action: ${result?.action || 'unknown'}).`,
      );
    return { cancelled: true };
  }

  async doGenerate(options: VideoGenerationOptions): Promise<VideoTask> {
    if (
      [
        options.referenceFile,
        options.referenceLink,
        options.audio,
        options.seed,
        options.promptExtend,
        options.watermark,
      ].some((value) => value !== undefined)
    )
      throw new Error(
        'MiniMax does not support reference_file, reference_link, audio, seed, prompt_extend or watermark options in this tool',
      );
    const isMax = this.modelId === 'MiniMax-H3-Max';
    if (!isMax && this.modelId !== 'MiniMax-H3') {
      throw new Error(`Unsupported MiniMax V2 video model: ${this.modelId}`);
    }
    const prompt = options.prompt?.trim();
    if (!prompt || Array.from(prompt).length > 7000)
      throw new Error('Video prompt must contain 1–7000 characters');
    const duration = options.duration ?? 5;
    const resolution = options.resolution ?? '768P';
    if (
      !Number.isInteger(duration) ||
      duration < (isMax ? 5 : 4) ||
      duration > 15
    ) {
      throw new Error(
        `${this.modelId} duration must be an integer between ${isMax ? 5 : 4} and 15 seconds`,
      );
    }
    if (!(isMax ? ['480P', '768P'] : ['768P', '2K']).includes(resolution)) {
      throw new Error(
        `Unsupported resolution ${resolution} for ${this.modelId}`,
      );
    }
    const hasFrames = Boolean(options.firstFrame || options.lastFrame);
    const hasReferences = Boolean(
      options.referenceImages?.length ||
      options.referenceVideos?.length ||
      options.referenceAudios?.length,
    );
    if (hasFrames && hasReferences)
      throw new Error('First/last frames cannot be mixed with reference media');
    if (isMax && hasReferences)
      throw new Error('MiniMax-H3-Max does not support reference media');
    if (
      (options.referenceImages?.length ?? 0) > 9 ||
      (options.referenceVideos?.length ?? 0) > 3 ||
      (options.referenceAudios?.length ?? 0) > 3
    ) {
      throw new Error(
        'MiniMax supports at most 9 reference images, 3 reference videos and 3 reference audio files',
      );
    }
    const ratio =
      options.aspectRatio ?? (hasFrames || hasReferences ? 'adaptive' : '16:9');
    if (
      !ratios.includes(ratio) ||
      (!hasFrames && !hasReferences && ratio === 'adaptive')
    ) {
      throw new Error(
        'Invalid video aspect ratio; text-to-video requires an explicit ratio',
      );
    }
    const content: object[] = [{ type: 'text', text: prompt }];
    const addMedia = (url: string, type: string, role: string) => {
      if (
        !/^(https?:\/\/|mm_file:\/\/|data:(image|video|audio)\/)/i.test(url)
      ) {
        throw new Error(
          'Video input media must be a public URL, data URI or provider file reference',
        );
      }
      content.push({ type, [type]: { url }, role });
    };
    if (options.firstFrame)
      addMedia(options.firstFrame, 'image_url', 'first_frame');
    if (options.lastFrame)
      addMedia(options.lastFrame, 'image_url', 'last_frame');
    options.referenceImages?.forEach((url) =>
      addMedia(url, 'image_url', 'reference_image'),
    );
    options.referenceVideos?.forEach((url) =>
      addMedia(url, 'video_url', 'reference_video'),
    );
    options.referenceAudios?.forEach((url) =>
      addMedia(url, 'audio_url', 'reference_audio'),
    );
    const body = {
      model: this.modelId,
      content,
      resolution,
      duration,
      ratio: hasFrames ? 'adaptive' : ratio,
    };
    if (Buffer.byteLength(JSON.stringify(body)) > 64 * 1024 * 1024) {
      throw new Error(
        'MiniMax video request exceeds 64 MB; use public URLs for large media',
      );
    }
    const data = await this.request(
      '/video_generation',
      options.abortSignal,
      body,
    );
    if (typeof data?.task_id !== 'string' || !data.task_id)
      throw new Error('MiniMax video response is missing task_id');
    return { taskId: data.task_id, status: 'queued' };
  }

  async getTask(
    taskId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<VideoTask> {
    if (!taskId.trim()) throw new Error('Video task ID is required');
    const data = await this.request(
      `/query/video_generation/${encodeURIComponent(taskId)}`,
      options?.abortSignal,
    );
    const task = data?.task;
    if (!task || task.id !== taskId || !statuses.includes(task.status)) {
      throw new Error('MiniMax returned an invalid video task');
    }
    const url = task.content?.url;
    if (
      task.status === 'succeeded' &&
      (typeof url !== 'string' || !/^https?:\/\//i.test(url))
    ) {
      throw new Error('MiniMax video task succeeded without a valid video URL');
    }
    return {
      taskId,
      status: task.status,
      url,
      error: task.error?.message || task.error?.code,
    };
  }
}
