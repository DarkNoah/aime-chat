import type { AppInfo } from '@/types/app';

type DefaultModels = AppInfo['defaultModel'];

const defaultModelEnv: Record<keyof DefaultModels, string> = {
  model: 'DEFAULT_MODEL',
  fastModel: 'DEFAULT_FAST_MODEL',
  visionModel: 'DEFAULT_VISION_MODEL',
  embeddingModel: 'DEFAULT_EMBEDDING_MODEL',
  rerankerModel: 'DEFAULT_RERANKER_MODEL',
  ocrModel: 'DEFAULT_OCR_MODEL',
  transcriptionModel: 'DEFAULT_TRANSCRIPTION_MODEL',
  speechModel: 'DEFAULT_SPEECH_MODEL',
  generateImageModel: 'DEFAULT_GENERATE_IMAGE_MODEL',
  generateVideoModel: 'DEFAULT_GENERATE_VIDEO_MODEL',
};

export function resolveDefaultModels(
  saved?: Partial<DefaultModels>,
  env: NodeJS.ProcessEnv = process.env,
): DefaultModels {
  return {
    ...Object.fromEntries(
      Object.entries(defaultModelEnv).map(([key, name]) => [key, env[name]]),
    ),
    ...(saved ?? {}),
  } as DefaultModels;
}

function parseDefaultModelPatch(input: unknown): Partial<DefaultModels> {
  const invalid = (message: string) =>
    Object.assign(new Error(message), { status: 400 });
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Expected a default model settings object');
  }
  const entries = Object.entries(input);
  if (!entries.length)
    throw invalid('Provide at least one default model field');
  const patch: Partial<DefaultModels> = {};
  for (const [key, value] of entries) {
    if (!Object.hasOwn(defaultModelEnv, key)) {
      throw invalid(`Unknown default model field: ${key}`);
    }
    if (typeof value !== 'string') {
      throw invalid(
        `${key} must be a model ID string; use an empty string to clear it`,
      );
    }
    patch[key] = value.trim();
  }
  return patch;
}

/** Serialize API patches and existing IPC replacements against the same setting. */
export class DefaultModelSettings {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: {
      read: () => Promise<Partial<DefaultModels> | undefined>;
      write: (value: Partial<DefaultModels>) => Promise<void>;
    },
  ) {}

  async list(): Promise<DefaultModels> {
    await this.queue;
    return resolveDefaultModels(await this.storage.read());
  }

  async set(input: unknown): Promise<DefaultModels> {
    const patch = parseDefaultModelPatch(input);
    const save = this.queue.then(async () => {
      // Merge saved values only: environment fallbacks must not become overrides.
      const next = { ...(await this.storage.read()), ...patch };
      await this.storage.write(next);
      return resolveDefaultModels(next);
    });
    this.queue = save.then(
      () => undefined,
      () => undefined,
    );
    return save;
  }

  async replace(value: Partial<DefaultModels>): Promise<void> {
    const save = this.queue.then(() => this.storage.write(value));
    this.queue = save.catch(() => undefined);
    return save;
  }
}
