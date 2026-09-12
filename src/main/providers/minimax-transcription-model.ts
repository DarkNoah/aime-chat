import type {
  TranscriptionModelV2,
  TranscriptionModelV2CallOptions,
} from '@ai-sdk/provider';
import type { Providers } from '@/entities/providers';

const audioFormats: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/aac': 'aac',
  'audio/opus': 'opus',
  'audio/ogg': 'ogg',
};

export class MiniMaxTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  readonly provider = 'minimax';

  readonly modelId: string;

  private readonly apiBase: string;

  private readonly apiKey: string;

  constructor({
    modelId,
    provider,
    apiBase,
  }: {
    modelId: string;
    provider: Providers;
    apiBase: string;
  }) {
    this.modelId = modelId;
    this.apiKey = provider.apiKey;
    this.apiBase = `${apiBase.replace(/\/+$/, '').replace(/\/v[12]$/, '')}/v1`;
  }

  async doGenerate(
    options: TranscriptionModelV2CallOptions,
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    if (this.modelId !== 'asr-1.0')
      throw new Error(
        `Unsupported MiniMax transcription model: ${this.modelId}`,
      );
    if (!this.apiKey?.trim()) throw new Error('MiniMax API key is not set');
    options.abortSignal?.throwIfAborted();
    const mediaType = options.mediaType.split(';')[0].trim().toLowerCase();
    const extension = audioFormats[mediaType];
    if (!extension)
      throw new Error(
        `Unsupported MiniMax transcription audio format: ${mediaType}`,
      );
    const audio =
      typeof options.audio === 'string'
        ? Buffer.from(options.audio, 'base64')
        : options.audio;
    if (!audio.byteLength || audio.byteLength > 50 * 1024 * 1024)
      throw new Error(
        'MiniMax transcription requires a nonempty audio file up to 50 MB (maximum duration: 500 seconds)',
      );
    const providerOptions = options.providerOptions?.minimax;
    const language = providerOptions?.language;
    if (language !== undefined && typeof language !== 'string')
      throw new Error('MiniMax transcription language must be a BCP-47 string');
    const requestedLevel = providerOptions?.timestampLevel;
    if (
      requestedLevel !== undefined &&
      requestedLevel !== 'word' &&
      requestedLevel !== 'sentence'
    )
      throw new Error('MiniMax timestampLevel must be word or sentence');
    const openaiLevels =
      options.providerOptions?.openai?.timestampGranularities;
    let timestampLevel =
      Array.isArray(openaiLevels) && openaiLevels.includes('word')
        ? 'word'
        : 'sentence';
    if (requestedLevel === 'word' || requestedLevel === 'sentence')
      timestampLevel = requestedLevel;
    const form = new FormData();
    form.append('model', this.modelId);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_level', timestampLevel);
    form.append('stream', 'false');
    form.append(
      'file',
      new Blob([Uint8Array.from(audio)], { type: mediaType }),
      `audio.${extension}`,
    );
    // Let fetch set the multipart boundary even if callers supplied Content-Type.
    const headers = new Headers(options.headers);
    headers.delete('Content-Type');
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    if (typeof language === 'string' && language)
      headers.set('language', language);
    const response = await fetch(`${this.apiBase}/speech_to_text`, {
      method: 'POST',
      headers,
      body: form,
      signal: options.abortSignal
        ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(300_000)])
        : AbortSignal.timeout(300_000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `MiniMax transcription returned an invalid response (HTTP ${response.status})`,
      );
    }
    if (!response.ok || data?.error || data?.base_resp?.status_code)
      throw new Error(
        data?.error?.message ||
          data?.base_resp?.status_msg ||
          data?.message ||
          `MiniMax transcription failed (HTTP ${response.status})`,
      );
    if (
      typeof data?.text !== 'string' ||
      !Number.isFinite(data.duration) ||
      data.duration < 0 ||
      !Array.isArray(data.segments)
    )
      throw new Error('MiniMax transcription returned an invalid transcript');
    const segments = data.segments.map((segment: any) => {
      if (
        typeof segment?.text !== 'string' ||
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end < segment.start
      )
        throw new Error('MiniMax transcription returned invalid timestamps');
      return {
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end,
      };
    });
    return {
      text: data.text,
      segments,
      language: typeof data.language === 'string' ? data.language : undefined,
      durationInSeconds: data.duration,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(response.headers.entries()),
        body: data,
      },
    };
  }
}
