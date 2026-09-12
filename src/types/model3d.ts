export interface Model3DGenerationOptions {
  prompt?: string;
  image?: string;
  images?: Array<{
    view: 'front' | 'left' | 'back' | 'right';
    image: string;
    format?: 'jpeg' | 'png';
  }>;
  textured?: boolean;
  textureQuality?: 'standard' | 'detailed';
  geometryQuality?: 'standard' | 'ultra';
  abortSignal?: AbortSignal;
}

export interface Model3DTask {
  taskId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  results?: Array<{ url: string; format: 'glb'; previewUrl?: string }>;
  error?: string;
}

/** Provider-neutral asynchronous 3D generation contract. */
export interface Model3D {
  readonly provider: string;
  readonly modelId: string;
  readonly pollingIntervalMs?: number;
  uploadImage?(options: {
    data: Uint8Array;
    fileName: string;
    mimeType: string;
    abortSignal?: AbortSignal;
  }): Promise<string>;
  doGenerate(options: Model3DGenerationOptions): Promise<Model3DTask>;
  getTask(
    taskId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Model3DTask>;
}
