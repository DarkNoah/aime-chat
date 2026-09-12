import type { TranscriptionModelV2CallOptions } from '@ai-sdk/provider';
import type { UrlTranscriptionModel } from '@/types/transcription';
import { setTimeout as delay } from 'timers/promises';
import mime from 'mime';
import { uploadToAlibabaOss } from './alibaba-file-upload';

type Mode = 'async' | 'flash' | 'qwen-flash';
const commonRegions = ['cn-beijing', 'ap-southeast-1'];
export const ALIBABA_TRANSCRIPTION_MODELS: Array<{
  id: string;
  name: string;
  mode: Mode;
  regions: string[];
}> = [
  {
    id: 'qwen-audio-3.0-asr-flash-filetrans',
    name: 'Qwen Audio 3.0 ASR Filetrans',
    mode: 'async',
    regions: commonRegions,
  },
  {
    id: 'qwen-audio-3.0-asr-flash',
    name: 'Qwen Audio 3.0 ASR Flash',
    mode: 'flash',
    regions: commonRegions,
  },
  { id: 'fun-asr', name: 'Fun ASR', mode: 'async', regions: commonRegions },
  {
    id: 'fun-asr-mtl',
    name: 'Fun ASR Multilingual',
    mode: 'async',
    regions: commonRegions,
  },
  {
    id: 'fun-asr-flash-2026-06-15',
    name: 'Fun ASR Flash',
    mode: 'flash',
    regions: commonRegions,
  },
  {
    id: 'qwen3-asr-flash-filetrans',
    name: 'Qwen3 ASR Flash Filetrans',
    mode: 'async',
    regions: commonRegions,
  },
  {
    id: 'qwen3-asr-flash',
    name: 'Qwen3 ASR Flash (text only)',
    mode: 'qwen-flash',
    regions: commonRegions,
  },
  {
    id: 'qwen3-asr-flash-us',
    name: 'Qwen3 ASR Flash US (text only)',
    mode: 'qwen-flash',
    regions: ['us-east-1'],
  },
  {
    id: 'paraformer-v2',
    name: 'Paraformer V2',
    mode: 'async',
    regions: ['cn-beijing'],
  },
  {
    id: 'paraformer-mtl-v1',
    name: 'Paraformer Multilingual V1',
    mode: 'async',
    regions: ['cn-beijing'],
  },
];

const formats: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/x-ms-wma': 'wma',
};
type Result = Awaited<ReturnType<UrlTranscriptionModel['doGenerate']>>;

export class AlibabaTranscriptionModel implements UrlTranscriptionModel {
  readonly specificationVersion = 'v2';

  readonly provider = 'alibaba';

  readonly modelId: string;

  private readonly mode: Mode;

  private readonly apiBase: string;

  private readonly apiKey: string;

  constructor(options: {
    modelId: string;
    apiBase: string;
    apiKey: string;
    region: string;
  }) {
    const model = ALIBABA_TRANSCRIPTION_MODELS.find(
      (item) => item.id === options.modelId,
    );
    if (!model || !model.regions.includes(options.region))
      throw new Error(
        `Alibaba transcription model ${options.modelId} is not supported in ${options.region}`,
      );
    this.modelId = options.modelId;
    this.mode = model.mode;
    this.apiBase = options.apiBase.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
  }

  private async request(
    url: string,
    signal?: AbortSignal,
    body?: object,
    headers: Record<string, string> = {},
    authenticated = true,
  ) {
    if (authenticated && !this.apiKey?.trim())
      throw new Error('Alibaba API key is not set');
    signal?.throwIfAborted();
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      ...(authenticated
        ? {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              ...headers,
            },
          }
        : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(300_000)])
        : AbortSignal.timeout(300_000),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Alibaba transcription returned invalid JSON (HTTP ${response.status})`,
      );
    }
    if (!response.ok || data?.code || data?.error)
      throw new Error(
        [data?.code, data?.message || data?.error?.message]
          .filter(Boolean)
          .join(': ') ||
          `Alibaba transcription failed (HTTP ${response.status})`,
      );
    signal?.throwIfAborted();
    return data;
  }

  canGenerateFromUrl(url: string): boolean {
    if (this.mode !== 'flash') return true;
    // Flash requires a format. Opaque URLs use the tool's download/conversion path.
    const mediaType = mime.lookup(new URL(url).pathname);
    return Boolean(mediaType && formats[mediaType]);
  }

  async doGenerateFromUrl({
    url,
    abortSignal,
  }: {
    url: string;
    abortSignal?: AbortSignal;
  }): Promise<Result> {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error('Alibaba transcription requires an HTTP(S) audio URL');
    const mediaType = mime.lookup(parsed.pathname);
    return this.transcribe(
      url,
      mediaType ? formats[mediaType] : undefined,
      abortSignal,
    );
  }

  async doGenerate(options: TranscriptionModelV2CallOptions): Promise<Result> {
    const { abortSignal } = options;
    abortSignal?.throwIfAborted();
    if (!this.apiKey?.trim()) throw new Error('Alibaba API key is not set');
    const mediaType = options.mediaType.split(';')[0].trim().toLowerCase();
    const format = formats[mediaType];
    if (!format)
      throw new Error(
        `Unsupported Alibaba transcription audio format: ${mediaType}`,
      );
    const audio =
      typeof options.audio === 'string'
        ? Buffer.from(options.audio, 'base64')
        : options.audio;
    const maxBytes =
      this.mode === 'qwen-flash' ? 10 * 1024 * 1024 : 1024 * 1024 * 1024;
    if (!audio.byteLength || audio.byteLength > maxBytes)
      throw new Error(
        `Alibaba local audio must be nonempty and at most ${maxBytes / 1024 / 1024} MB; use a public URL for larger supported files`,
      );
    let source: string;
    const dataPrefix = `data:${mediaType};base64,`;
    if (
      this.mode !== 'async' &&
      dataPrefix.length + 4 * Math.ceil(audio.byteLength / 3) <=
        10 * 1024 * 1024
    ) {
      source = dataPrefix + Buffer.from(audio).toString('base64');
    } else {
      const policy = await this.request(
        `${this.apiBase}/uploads?action=getPolicy&model=${encodeURIComponent(this.modelId)}`,
        abortSignal,
      );
      source = await uploadToAlibabaOss(policy?.data, {
        data: audio,
        fileName: `audio.${format}`,
        mimeType: mediaType,
        abortSignal,
      });
    }
    return this.transcribe(source, format, abortSignal);
  }

  private async transcribe(
    source: string,
    format: string | undefined,
    signal?: AbortSignal,
  ): Promise<Result> {
    const resolveHeaders = source.startsWith('oss://')
      ? { 'X-DashScope-OssResourceResolve': 'enable' }
      : {};
    if (this.mode !== 'async') {
      if (this.mode === 'flash' && !format)
        throw new Error(
          'The selected Alibaba Flash model requires a known audio format',
        );
      const qwen = this.mode === 'qwen-flash';
      const data = await this.request(
        `${this.apiBase}/services/aigc/multimodal-generation/generation`,
        signal,
        {
          model: this.modelId,
          input: {
            messages: [
              {
                role: 'user',
                content: [
                  qwen
                    ? { audio: source }
                    : { type: 'input_audio', input_audio: { data: source } },
                ],
              },
            ],
          },
          parameters: qwen
            ? { asr_options: { enable_itn: false }, result_format: 'message' }
            : { format },
        },
        { ...resolveHeaders, 'X-DashScope-SSE': 'disable' },
      );
      if (qwen) {
        const message = data?.output?.choices?.[0]?.message;
        const content = message?.content;
        let text: string | undefined;
        if (typeof content === 'string') text = content;
        else if (
          Array.isArray(content) &&
          content.every((item) => typeof item?.text === 'string')
        )
          text = content.map((item) => item.text).join('');
        if (typeof text !== 'string')
          throw new Error('Alibaba Qwen ASR returned an invalid transcript');
        return this.result(
          text,
          [],
          data,
          data?.usage?.seconds,
          message?.annotations?.find((item: any) => item.type === 'audio_info')
            ?.language,
        );
      }
      // Both shapes appear in the official Flash API/guide examples.
      const output = data?.output;
      const sentence = output?.sentence ?? output?.output?.sentence;
      const text = output?.text ?? sentence?.text;
      if (typeof text !== 'string')
        throw new Error('Alibaba Flash ASR returned an invalid transcript');
      const segments = sentence ? this.segments([sentence]) : [];
      return this.result(text, segments, data, data?.usage?.duration);
    }
    const qwenFile = this.modelId.startsWith('qwen3-asr-flash-filetrans');
    let data = await this.request(
      `${this.apiBase}/services/audio/asr/transcription`,
      signal,
      {
        model: this.modelId,
        input: qwenFile ? { file_url: source } : { file_urls: [source] },
        parameters: {
          channel_id: [0],
          ...(qwenFile ? { enable_itn: false, enable_words: true } : {}),
        },
      },
      { ...resolveHeaders, 'X-DashScope-Async': 'enable' },
    );
    const taskId = data?.output?.task_id;
    if (typeof taskId !== 'string' || !taskId)
      throw new Error('Alibaba transcription response is missing task_id');
    while (['PENDING', 'RUNNING'].includes(data?.output?.task_status)) {
      // Poll sequentially so the next request follows the latest task state.
      // eslint-disable-next-line no-await-in-loop
      await delay(3000, undefined, { signal });
      // eslint-disable-next-line no-await-in-loop
      data = await this.request(
        `${this.apiBase}/tasks/${encodeURIComponent(taskId)}`,
        signal,
      );
      if (data?.output?.task_id !== taskId)
        throw new Error('Alibaba transcription task_id does not match');
    }
    if (data?.output?.task_status !== 'SUCCEEDED')
      throw new Error(
        [data?.output?.task_status, data?.output?.code, data?.output?.message]
          .filter(Boolean)
          .join(': ') ||
          'Alibaba transcription task returned an invalid status',
      );
    const entries = qwenFile ? [data.output.result] : data.output.results;
    if (!Array.isArray(entries) || entries.length !== 1)
      throw new Error(
        'Alibaba transcription response is missing the file result',
      );
    const entry = entries[0];
    if (!qwenFile && entry?.subtask_status !== 'SUCCEEDED')
      throw new Error(
        [entry?.code, entry?.message].filter(Boolean).join(': ') ||
          'Alibaba transcription file failed',
      );
    const url = entry?.transcription_url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url))
      throw new Error('Alibaba transcription result URL is invalid');
    // Result URLs are signed/public; never forward the provider API key.
    const transcript = await this.request(url, signal, undefined, {}, false);
    if (!Array.isArray(transcript?.transcripts))
      throw new Error('Alibaba transcription result is invalid');
    const channels = transcript.transcripts;
    if (
      channels.some(
        (channel: any) =>
          typeof channel?.text !== 'string' ||
          !Array.isArray(channel.sentences),
      )
    )
      throw new Error('Alibaba transcription result contains invalid channels');
    const sentences = channels.flatMap((channel: any) => channel.sentences);
    const segments = this.segments(sentences);
    const durationMs =
      transcript?.properties?.original_duration_in_milliseconds;
    const duration = Number.isFinite(durationMs)
      ? durationMs / 1000
      : (data?.usage?.seconds ?? data?.usage?.duration);
    const languages = [
      ...new Set(
        sentences
          .map((sentence: any) => sentence.language)
          .filter((language: any) => typeof language === 'string'),
      ),
    ];
    return this.result(
      channels.map((channel: any) => channel.text).join('\n'),
      segments,
      transcript,
      duration,
      languages.length === 1 ? languages[0] : undefined,
    );
  }

  // Milliseconds from Alibaba become seconds in the AI SDK contract.
  // eslint-disable-next-line class-methods-use-this
  private segments(sentences: any[]): Result['segments'] {
    return sentences.flatMap((sentence) => {
      const items =
        Array.isArray(sentence.words) && sentence.words.length
          ? sentence.words
          : [sentence];
      return items.map((item: any) => {
        if (
          typeof item?.text !== 'string' ||
          !Number.isFinite(item.begin_time) ||
          !Number.isFinite(item.end_time) ||
          item.begin_time < 0 ||
          item.end_time < item.begin_time
        )
          throw new Error('Alibaba transcription returned invalid timestamps');
        return {
          text:
            item.text +
            (typeof item.punctuation === 'string' ? item.punctuation : ''),
          startSecond: item.begin_time / 1000,
          endSecond: item.end_time / 1000,
        };
      });
    });
  }

  private result(
    text: string,
    segments: Result['segments'],
    body: any,
    duration?: number,
    language?: unknown,
  ): Result {
    return {
      text,
      segments,
      durationInSeconds:
        Number.isFinite(duration) && duration >= 0 ? duration : undefined,
      language: typeof language === 'string' ? language : undefined,
      warnings: [],
      response: { timestamp: new Date(), modelId: this.modelId, body },
    };
  }
}
