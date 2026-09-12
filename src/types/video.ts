export type VideoTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface VideoGenerationOptions {
  prompt: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  referenceFile?: string;
  referenceLink?: string;
  audio?: boolean;
  seed?: number;
  promptExtend?: boolean;
  watermark?: boolean;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  abortSignal?: AbortSignal;
}

export interface VideoTask {
  taskId: string;
  status: VideoTaskStatus;
  url?: string;
  error?: string;
}

export interface VideoMediaUpload {
  data: Uint8Array;
  fileName: string;
  mimeType: string;
  abortSignal?: AbortSignal;
}

/** Provider-neutral asynchronous video generation contract. */
export interface VideoModel {
  readonly provider: string;
  readonly modelId: string;
  readonly pollingIntervalMs?: number;
  readonly localMedia?: Partial<
    Record<
      'image' | 'video' | 'audio',
      | false
      | {
          transport?: 'base64' | 'upload';
          supportsBase64?: boolean;
          maxBytes: number;
          mimeTypes: string[];
        }
    >
  >;
  uploadMedia?(options: VideoMediaUpload): Promise<string>;
  cancelTask?(
    taskId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<{
    cancelled: boolean;
    message?: string;
  }>;
  doGenerate(options: VideoGenerationOptions): Promise<VideoTask>;
  getTask(
    taskId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<VideoTask>;
}
