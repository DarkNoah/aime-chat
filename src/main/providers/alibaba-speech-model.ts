import type { SpeechModelV2, SpeechModelV2CallOptions } from '@ai-sdk/provider';

type Family = 'audio' | 'cosy' | 'qwen' | 'minimax';
type SpeechModel = {
  id: string;
  name: string;
  family: Family;
  regions: string[];
  defaultVoice?: string;
};
const beijing = ['cn-beijing'];
const international = ['cn-beijing', 'ap-southeast-1'];

export const ALIBABA_SPEECH_MODELS: SpeechModel[] = [
  ...['plus', 'flash'].map(
    (tier): SpeechModel => ({
      id: `qwen-audio-3.0-tts-${tier}`,
      name: `Qwen Audio 3.0 TTS ${tier}`,
      family: 'audio',
      regions: beijing,
      defaultVoice: 'longanhuan_v3.6',
    }),
  ),
  ...['v3.5-plus', 'v3.5-flash', 'v3-plus', 'v3-flash', 'v2'].map(
    (version): SpeechModel => ({
      id: `cosyvoice-${version}`,
      name: `CosyVoice ${version}${version.startsWith('v3.5') ? ' (custom voice)' : ''}`,
      family: 'cosy',
      regions: beijing,
      defaultVoice: {
        'v3-plus': 'longanyang',
        'v3-flash': 'longanyang',
        v2: 'longxiaochun_v2',
      }[version],
    }),
  ),
  ...[
    ['qwen3-tts-instruct-flash', 'Qwen3 TTS Instruct Flash', 'Cherry'],
    ['qwen3-tts-flash', 'Qwen3 TTS Flash', 'Cherry'],
    ['qwen3-tts-vd-2026-01-26', 'Qwen3 TTS Voice Design (custom voice)'],
    ['qwen3-tts-vc-2026-01-22', 'Qwen3 TTS Voice Clone (custom voice)'],
  ].map(
    ([id, name, defaultVoice]): SpeechModel => ({
      id,
      name,
      defaultVoice,
      family: 'qwen',
      regions: international,
    }),
  ),
  ...['2.8-hd', '2.8-turbo', '02-hd', '02-turbo'].map(
    (version): SpeechModel => ({
      id: `MiniMax/speech-${version}`,
      name: `MiniMax Speech ${version}`,
      family: 'minimax',
      regions: beijing,
      defaultVoice: 'male-qn-qingse',
    }),
  ),
];

const languageNames: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  es: 'Spanish',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  ru: 'Russian',
  th: 'Thai',
  id: 'Indonesian',
  vi: 'Vietnamese',
  ms: 'Malay',
  fil: 'Filipino',
  ar: 'Arabic',
};
const qwenLanguages = new Set([
  'zh',
  'en',
  'de',
  'it',
  'pt',
  'es',
  'ja',
  'ko',
  'fr',
  'ru',
]);

// Read RIFF chunks rather than estimating duration from the entire file size.
function wavMetadata(audio: Buffer): {
  sampleRate?: number;
  duration?: number;
} {
  if (
    audio.length < 12 ||
    audio.toString('ascii', 0, 4) !== 'RIFF' ||
    audio.toString('ascii', 8, 12) !== 'WAVE'
  )
    return {};
  let sampleRate = 0;
  let byteRate = 0;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= audio.length; ) {
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > audio.length) break;
    const id = audio.toString('ascii', offset, offset + 4);
    if (id === 'fmt ' && size >= 16) {
      sampleRate = audio.readUInt32LE(start + 4);
      byteRate = audio.readUInt32LE(start + 8);
    } else if (id === 'data') dataSize += size;
    offset = start + size + (size % 2);
  }
  return {
    ...(sampleRate > 0 ? { sampleRate } : {}),
    ...(byteRate > 0 && dataSize > 0 ? { duration: dataSize / byteRate } : {}),
  };
}

export class AlibabaSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  readonly provider = 'alibaba';

  readonly modelId: string;

  private readonly model: SpeechModel;

  private readonly endpoint: string;

  private readonly apiKey: string;

  constructor(options: {
    modelId: string;
    apiKey: string;
    apiBase: string;
    region: string;
  }) {
    const model = ALIBABA_SPEECH_MODELS.find(
      (item) => item.id === options.modelId,
    );
    if (!model || !model.regions.includes(options.region))
      throw new Error(
        `Alibaba speech model ${options.modelId} is not supported in ${options.region}`,
      );
    this.model = model;
    this.modelId = model.id;
    this.apiKey = options.apiKey;
    const base =
      model.family === 'qwen'
        ? `https://${options.region === 'ap-southeast-1' ? 'dashscope-intl' : 'dashscope'}.aliyuncs.com/api/v1`
        : options.apiBase.replace(/\/+$/, '');
    this.endpoint = `${base}/services/${
      model.family === 'audio' || model.family === 'cosy'
        ? 'audio/tts/SpeechSynthesizer'
        : 'aigc/multimodal-generation/generation'
    }`;
  }

  private buildInput(options: SpeechModelV2CallOptions) {
    const { text, instructions, speed = 1 } = options;
    const { family } = this.model;
    if (!text.trim()) throw new Error('Speech text must not be empty');
    if (
      options.providerOptions?.local?.ref_audio ||
      options.providerOptions?.local?.ref_text
    )
      throw new Error(
        'Alibaba TTS requires an existing voice ID for cloned/designed voices. Create the voice in Alibaba first, then pass voice; ref_audio/ref_text are not supported here.',
      );
    const voice = options.voice?.trim() || this.model.defaultVoice;
    if (!voice)
      throw new Error(
        `${this.modelId} requires an existing custom voice ID in voice`,
      );
    const format = options.outputFormat || 'wav';
    const formats = {
      qwen: ['wav'],
      minimax: ['mp3', 'pcm', 'flac', 'wav'],
      audio: ['mp3', 'pcm', 'wav', 'opus'],
      cosy: ['mp3', 'pcm', 'wav', 'opus'],
    }[family];
    if (!formats.includes(format))
      throw new Error(
        `${this.modelId} does not support output format ${format}`,
      );
    if (!Number.isFinite(speed) || speed < 0.5 || speed > 2)
      throw new Error('Alibaba speech speed must be between 0.5 and 2');
    if (family === 'qwen' && speed !== 1)
      throw new Error('Qwen TTS does not support the speed parameter');
    if (family === 'qwen' && Array.from(text).length > 600)
      throw new Error('Qwen3 TTS text must not exceed 600 characters');
    if (family === 'minimax' && Array.from(text).length >= 10000)
      throw new Error(
        'MiniMax speech text must be shorter than 10000 characters',
      );
    if (
      instructions &&
      (family === 'minimax' ||
        this.modelId === 'cosyvoice-v2' ||
        (family === 'qwen' && this.modelId !== 'qwen3-tts-instruct-flash'))
    )
      throw new Error(`${this.modelId} does not support speech instructions`);
    if (
      instructions &&
      family === 'cosy' &&
      Array.from(instructions).reduce(
        (length, char) => length + (/\p{Script=Han}/u.test(char) ? 2 : 1),
        0,
      ) > 100
    )
      throw new Error(
        'CosyVoice instructions must not exceed 100 characters (Chinese characters count as two)',
      );

    const language = options.language?.trim();
    const code =
      !language || language.toLowerCase() === 'auto'
        ? undefined
        : Object.keys(languageNames).find(
            (key) =>
              key === language.toLowerCase() ||
              languageNames[key].toLowerCase() === language.toLowerCase(),
          );
    if (language && language.toLowerCase() !== 'auto' && !code)
      throw new Error(`Unsupported Alibaba speech language: ${language}`);

    if (family === 'qwen') {
      if (code && !qwenLanguages.has(code))
        throw new Error(`Qwen TTS does not support ${language}`);
      return {
        text,
        voice,
        language_type: code ? languageNames[code] : 'Auto',
        ...(instructions ? { instructions } : {}),
      };
    }
    if (family === 'minimax')
      return {
        text,
        voice_setting: { voice_id: voice, speed },
        audio_setting: { sample_rate: 24000, format, channel: 1 },
        output_format: 'hex',
        language_boost: code ? languageNames[code] : 'auto',
      };
    return {
      text,
      voice,
      format,
      sample_rate: 24000,
      rate: speed,
      ...(code ? { language_hints: [code] } : {}),
      ...(instructions ? { instruction: instructions } : {}),
    };
  }

  async doGenerate(
    options: SpeechModelV2CallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV2['doGenerate']>>> {
    options.abortSignal?.throwIfAborted();
    if (!this.apiKey?.trim()) throw new Error('Alibaba API key is not set');
    const input = this.buildInput(options);
    const signal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(300_000)])
      : AbortSignal.timeout(300_000);
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.modelId, input }),
      signal,
      redirect: 'error',
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Alibaba speech returned invalid JSON (HTTP ${response.status})`,
      );
    }
    const baseResponse = data?.output?.base_resp;
    if (
      !response.ok ||
      data?.code ||
      data?.error ||
      (data?.status_code && data.status_code !== 200) ||
      (baseResponse?.status_code && baseResponse.status_code !== 0)
    )
      throw new Error(
        `Alibaba speech failed: ${data?.message || data?.error?.message || baseResponse?.status_msg || data?.code || `HTTP ${response.status}`}`,
      );
    let audio: Buffer;
    if (this.model.family === 'minimax') {
      const hex = data?.output?.data?.audio;
      if (typeof hex !== 'string' || !/^(?:[\da-f]{2})+$/i.test(hex))
        throw new Error(
          'Alibaba MiniMax speech returned missing or invalid hex audio',
        );
      audio = Buffer.from(hex, 'hex');
    } else {
      const url = data?.output?.audio?.url;
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url))
        throw new Error('Alibaba speech returned no audio URL');
      // Signed media URLs must not receive the provider API key.
      const media = await fetch(url, { signal });
      if (!media.ok)
        throw new Error(
          `Alibaba speech audio download failed (HTTP ${media.status})`,
        );
      audio = Buffer.from(await media.arrayBuffer());
    }
    options.abortSignal?.throwIfAborted();
    if (!audio.length) throw new Error('Alibaba speech returned empty audio');
    const extra = data?.output?.extra_info;
    const metadata = {
      ...wavMetadata(audio),
      ...(typeof extra?.audio_length === 'number' && extra.audio_length > 0
        ? { duration: extra.audio_length / 1000 }
        : {}),
      ...(typeof extra?.audio_sample_rate === 'number' &&
      extra.audio_sample_rate > 0
        ? { sampleRate: extra.audio_sample_rate }
        : {}),
    };
    return {
      audio,
      warnings: [],
      response: { timestamp: new Date(), modelId: this.modelId },
      providerMetadata: { alibaba: metadata },
    };
  }
}
