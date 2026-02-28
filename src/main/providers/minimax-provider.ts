import { Providers } from '@/entities/providers';
import { BaseProvider, MusicModel, RerankModel } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
  LanguageModelV2,
  SpeechModelV2,
  SpeechModelV2CallOptions,
  SpeechModelV2CallWarning,
  TranscriptionModelV2,
  TranscriptionModelV2CallOptions,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';
import { isString } from '@/utils/is';
import { m } from 'motion/react';

export class MiniMaxImageModel implements ImageModelV2 {
  specificationVersion: 'v2' = 'v2';
  provider: string = 'minimax';
  modelId: string;
  providerEntity: Providers;
  apiBase: string;

  constructor({ modelId, provider, apiBase }: { modelId: string; provider: Providers; apiBase: string }) {
    this.providerEntity = provider;
    this.modelId = modelId;
    this.apiBase = apiBase;
  }

  maxImagesPerCall:
    | number
    | ((options: {
      modelId: string;
    }) => PromiseLike<number | undefined> | number | undefined) = 1;
  async doGenerate(options: ImageModelV2CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<ImageModelV2CallWarning>;
    providerMetadata?: ImageModelV2ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const _options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.providerEntity.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        prompt: options.prompt,
        size: options?.size || '1024x1024',
        quality: 'standard',
        watermark_enabled: false,
      }),
    };

    const res = await fetch(
      'https://open.bigmodel.cn/api/paas/v4/images/generations',
      { ..._options, signal: options.abortSignal },
    );
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return {
      images: data.data.map((x) => x.url),
      warnings: [],
      providerMetadata: undefined,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }
}

export class MiniMaxTranscriptionModel implements TranscriptionModelV2 {
  specificationVersion: 'v2';
  provider: string = 'minimax';
  modelId: string;
  providerEntity: Providers;
  apiBase: string;
  constructor({ modelId, provider, apiBase }: { modelId: string; provider: Providers; apiBase: string }) {
    this.providerEntity = provider;
    this.modelId = modelId;
    this.apiBase = apiBase;
  }


  async doGenerate(options: TranscriptionModelV2CallOptions): Promise<{ text: string; segments: Array<{ text: string; startSecond: number; endSecond: number; }>; language: string | undefined; durationInSeconds: number | undefined; warnings: Array<TranscriptionModelV2CallWarning>; request?: { body?: string; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
    let audio: Uint8Array<ArrayBufferLike>;
    if (isString(options.audio)) {
      audio = Buffer.from(options.audio, 'base64');
    } else {
      audio = options.audio
    }

    const form = new FormData();
    form.append('model', 'glm-asr-2512');
    form.append('stream', 'false');
    form.append('file', new Blob([audio], { type: options.mediaType }), 'audio.wav');


    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.providerEntity.apiKey}`,
      },
      body: form,
      signal: options.abortSignal,
    });
    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message);
    }
    return {
      text: result.text,
      segments: result.result.items.map(item => {
        return {
          text: item.text,
          startSecond: item.start,
          endSecond: item.end,
        }
      }),
      language: result.result.language,
      durationInSeconds: result.result.duration,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: options.headers,
        body: result,
      },
    };
  }

}

export class MiniMaxSpeechModel implements SpeechModelV2 {
  specificationVersion: 'v2';
  provider: string = 'minimax';
  modelId: string;
  providerEntity: Providers;
  apiBase: string;

  constructor({ modelId, provider, apiBase }: { modelId: string; provider: Providers; apiBase: string }) {
    this.providerEntity = provider;
    this.modelId = modelId;
    this.apiBase = apiBase;
  }

  async doGenerate(options: SpeechModelV2CallOptions): Promise<{ audio: Uint8Array; warnings: Array<SpeechModelV2CallWarning>; request?: { body?: string; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
    const providerOptions = (options.providerOptions?.minimax ?? {}) as {
      voice?: string;
      speed?: number;
      volume?: number;
    };

    const body = {
      model: this.modelId || 'speech-2.8-hd',
      text: options.text,
      language_boost: options.language || 'Chinese',
      voice_setting: {
        voice_id: providerOptions?.voice || 'male-qn-qingse',
        speed: providerOptions?.speed || 1,
        vol: providerOptions?.volume || 1,
      },
      voice_modify: {

      },
      audio_setting: {
        sample_rate: 24000,
        format: options.outputFormat || 'wav'
      },
      output_format: 'url'
    };

    const res = await fetch(this.apiBase + '/t2a_v2', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.providerEntity.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!res.ok) {
      let errorMessage = 'MiniMax speech generation failed with status ' + res.status;
      try {
        const errorData = await res.json();
        errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
      } catch {
        // ignore non-json errors
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    const url = data.data.url;
    const extra_info = data.data.extra_info;
    const audioBuffer = new Uint8Array(await (await fetch(url)).arrayBuffer());

    return {
      audio: audioBuffer,
      warnings: [],
      request: {
        body: JSON.stringify(body),
      },
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(res.headers.entries()),
        body: data
      },
      providerMetadata: {
        "minimax": {
          "sampleRate": extra_info.audio_sample_rate,
          "duration": extra_info.audio_size / extra_info.audio_sample_rate,
        }
      }
    };
  }
}

export class MiniMaxMusicModel implements MusicModel {
  provider: string = 'minimax';
  modelId: string;
  providerEntity: Providers;
  apiBase: string;
  constructor({ modelId, provider, apiBase }: { modelId: string; provider: Providers; apiBase: string }) {
    this.apiBase = apiBase;
    this.providerEntity = provider;
    this.modelId = modelId;
  }
  async doGenerate(options: {
    prompt: string; lyrics?: string; sample_rate?: number; format?: 'mp3' | 'wav' | 'pcm';
  }): Promise<string> {
    const body = {
      model: this.modelId || 'music-2.5',
      prompt: options.prompt,
      lyrics: options.lyrics,
      audio_setting: {
        sample_rate: options.sample_rate || 24000,
        format: options.format || 'wav',
        output_format: 'url'
      }

    };
    const res = await fetch(this.apiBase + '/music_generation', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.providerEntity.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data.data.audio;
  }
}

export class MiniMaxProvider extends BaseProvider {
  name: string = 'minimax';
  type: ProviderType;
  description: string;
  defaultApiBase?: string = 'https://api.minimax.io/v1';
  openaiClient?: OpenAI;
  tags: ProviderTag[] = [];

  constructor(provider: Providers, type: ProviderType.MINIMAX | ProviderType.MINIMAX_CN) {
    super({ provider });
    this.type = type;
    if (type === ProviderType.MINIMAX_CN) {
      this.defaultApiBase = 'https://api.minimaxi.com/v1';
    } else if (type === ProviderType.MINIMAX) {
      this.defaultApiBase = 'https://api.minimax.io/v1';
    }
    //this.provider = provider;
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return {
      url: this.provider.apiBase || this.defaultApiBase,
      id: `${this.type}/${modelId}` as `${string}/${string}`,
      apiKey: this.provider.apiKey,
    };
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5' },
    ];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [

    ];
  }

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'speech-2.8-hd', name: 'Speech 2.8 HD' },
    { id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo' }

    ];
  }

  async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    return [];
  }


  async getMusicModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'music-2.5', name: 'Music 2.5' }];
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return undefined;
  }
  imageModel(modelId: string): ImageModelV2 {
    return undefined;
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return new MiniMaxSpeechModel({ modelId, provider: this.provider, apiBase: this.provider.apiBase || this.defaultApiBase });
  }
  rerankModel?(modelId: string): RerankModel {
    return undefined;
  }
  musicModel?(modelId: string): MusicModel {
    return new MiniMaxMusicModel({ modelId, provider: this.provider, apiBase: this.provider.apiBase || this.defaultApiBase });
  }
}
