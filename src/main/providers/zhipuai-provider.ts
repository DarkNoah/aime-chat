import { Providers } from '@/entities/providers';
import { BaseProvider, RerankModel } from './base-provider';
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
  TranscriptionModelV2,
  TranscriptionModelV2CallOptions,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';
import { isString } from '@/utils/is';

export class ZhipuAIRerankModel implements RerankModel {
  modelId: string;
  providerEntity: Providers;
  readonly provider: string = 'zhipuai';

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
    this.modelId = modelId;
  }

  async doRerank({
    query,
    documents,
    options,
  }: {
    query: string;
    documents: string[];
    options?: {
      top_k?: number;
      return_documents?: boolean;
    };
  }): Promise<{ index: number; score: number; document: string }[]> {
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.providerEntity.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId || 'rerank',
        query: query,
        top_n: options?.top_k || 10,
        documents: documents,
      }),
    });

    const data = await res.json();

    return data.results
      .map((res, i) => ({
        index: res.index,
        score: res.relevance_score,
        document: options?.return_documents ? documents[res.index] : undefined,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.top_k || 10);
  }
}

export class ZhipuAIImageModel implements ImageModelV2 {
  specificationVersion: 'v2' = 'v2';
  provider: string = 'zhipuai';
  modelId: string;
  providerEntity: Providers;

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
    this.modelId = modelId;
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


export class ZhipuAITranscriptionModel implements TranscriptionModelV2 {
  specificationVersion: 'v2';
  provider: string = 'zhipuai';
  modelId: string;
  providerEntity: Providers;

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
    this.modelId = modelId;
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




export class ZhipuAIProvider extends BaseProvider {
  name: string = 'zhipuai';
  type: ProviderType = ProviderType.ZHIPUAI;
  description: string;
  defaultApiBase?: string = 'https://open.bigmodel.cn/api/paas/v4';

  openaiClient?: OpenAI;

  tags: ProviderTag[] = [ProviderTag.WEB_SEARCH, ProviderTag.WEB_READER];

  constructor(provider: Providers) {
    super({ provider });
    //this.provider = provider;
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return {
      url: this.provider.apiBase || this.defaultApiBase,
      id: `zhipuai/${modelId}` as `${string}/${string}`,
      apiKey: this.provider.apiKey,
    };
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4.6v', name: 'GLM-4.6V' },
      { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash' },
      { id: 'autoglm-phone', name: 'AutoGLM-Phone' },
      { id: 'glm-4.6', name: 'GLM-4.6' },
      {
        id: 'glm-4.5',
        name: 'GLM-4.5',
      },
      {
        id: 'glm-4.5-air',
        name: 'GLM-4.5-Air',
      },
      {
        id: 'glm-4.5-x',
        name: 'GLM-4.5-X',
      },
      {
        id: 'glm-4.5-airx',
        name: 'GLM-4.5-AirX',
      },
      {
        id: 'glm-4.5-flash',
        name: 'GLM-4.5-Flash',
      },
      {
        id: 'glm-4.5v',
        name: 'GLM-4.5V',
      },
    ];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [
      { id: 'embedding-2', name: 'Embedding-2' },
      { id: 'embedding-3', name: 'Embedding-3' },
    ];
  }

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'rerank', name: 'Rerank' }];
  }
  async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'glm-asr-2512', name: 'GLM-ASR-2512' }];
  }
  async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'glm-tts', name: 'GLM-TTS' }];
  }

  async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'cogview-4', name: 'cogview-4' }];
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return undefined;
  }
  imageModel(modelId: string): ImageModelV2 {
    return new ZhipuAIImageModel({ modelId, provider: this.provider });
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return new ZhipuAITranscriptionModel({ modelId, provider: this.provider });
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
  rerankModel?(modelId: string): RerankModel {
    return new ZhipuAIRerankModel({ modelId, provider: this.provider });
  }
}
