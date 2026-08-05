import { Providers } from '@/entities/providers';
import { EmbeddingModel, LanguageModel } from 'ai';
import {
  EmbeddingModelV2,
  ImageModelV2,
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
  LanguageModelV2,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import { OpenAICompatibleConfig } from '@mastra/core/llm';


export interface BaseImageModelV2CallOptions extends Omit<
  ImageModelV2CallOptions,
  'prompt'
> {
  prompt:
  | string
  | { text: string; images: (string | Buffer)[]; mask?: string | Buffer };
}

export type RerankModel = {
  readonly provider: string;
  readonly modelId: string;
  // readonly maxEmbeddingsPerCall: PromiseLike<number | undefined> | number | undefined;
  // readonly supportsParallelCalls: PromiseLike<boolean> | boolean;
  doRerank: (options: {
    query: string;
    documents: string[];
    options?: {
      top_k?: number;
      return_documents?: boolean;
    };
  }) => Promise<{ index: number; score: number; document: string }[]>;
}

export interface ClipModel {
  readonly provider: string;
  readonly modelId: string;

  encodeText: (text: string) => Promise<Float32Array>;
  encodeTexts: (texts: string[]) => Promise<Float32Array[]>;
  encodeImage: (image: string) => Promise<Float32Array>;
  encodeImages: (images: string[]) => Promise<Float32Array[]>;

  cosineSimilarity(textVec: Float32Array, imageVec: Float32Array): number;
}






export interface OCRModel {
  readonly provider: string;
  readonly modelId: string;
  doOCR: (options: {
    image: string
    excludeInsideImage?: boolean;
    abortSignal?: AbortSignal;
  }) => Promise<string>;
}

export interface MusicModel {
  readonly provider: string;
  readonly modelId: string;
  doGenerate: (options: {
    prompt: string;
    sample_rate?: number;
    format?: 'mp3' | 'wav' | 'pcm'
  }) => Promise<string>;
}


export interface VideoModel {
  readonly provider: string;
  readonly modelId: string;
  doGenerate: (options: {
    prompt: string;
    image?: string[];
    duration?: number;

  }) => Promise<string>;
}




export interface BaseProviderParams {
  provider: Providers;
}

export abstract class BaseProvider implements ProviderV2 {
  id: string;
  abstract name: string;
  abstract type: ProviderType | string;
  abstract description?: string;
  abstract defaultApiBase?: string;
  hasChatModel?: boolean = true;

  provider: Providers;

  tags: ProviderTag[] = [];

  constructor(params?: BaseProviderParams) {
    this.provider = params?.provider;
    this.id = params?.provider.id;
  }

  languageModel(modelId: string): LanguageModelV2 | OpenAICompatibleConfig {
    throw new Error('Method not implemented.');
  }

  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    throw new Error('Method not implemented.');
  }

  imageModel(modelId: string): Omit<ImageModelV2, 'doGenerate'> & {
    doGenerate: (options: BaseImageModelV2CallOptions) => PromiseLike<{
      images: string[] | Uint8Array<ArrayBufferLike>[];
      warnings: ImageModelV2CallWarning[];
      providerMetadata?: ImageModelV2ProviderMetadata;
      response: {
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    }>;
  } {
    throw new Error('Method not implemented.');
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    throw new Error('Method not implemented.');
  }
  speechModel?(modelId: string): SpeechModelV2 {
    throw new Error('Method not implemented.');
  }
  rerankModel?(modelId: string): RerankModel {
    throw new Error('Method not implemented.');
  }

  ocrModel?(modelId: string): OCRModel {
    throw new Error('Method not implemented.');
  }
  musicModel?(modelId: string): MusicModel {
    throw new Error('Method not implemented.');
  }
  videoModel?(modelId: string): VideoModel {
    throw new Error('Method not implemented.');
  }



  abstract getLanguageModelList(): Promise<{ name: string; id: string }[]>;

  abstract getEmbeddingModelList(): Promise<{ name: string; id: string }[]>;

  abstract getRerankModelList(): Promise<{ name: string; id: string }[]>;

  async getOCRModelList(): Promise<{ name: string; id: string }[]> {
    return Promise.resolve([]);
  }
  async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
    return Promise.resolve([]);
  }
  async getMusicModelList(): Promise<{ name: string; id: string }[]> {
    return Promise.resolve([]);
  }
  async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
    return Promise.resolve([]);
  }
  async getVideoModelList(): Promise<{ name: string; id: string }[]> {
    return Promise.resolve([]);
  }

  getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    throw new Error('Method not implemented.');
  }



  abstract getCredits(): Promise<ProviderCredits | undefined>;
}


export class OpenAIRerankModel implements RerankModel {
  modelId: string;
  providerEntity: Providers;
  readonly provider: string;

  constructor(name: string, { modelId, provider }: { modelId: string; provider: Providers }) {
    this.provider = name;
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
    const headers = { 'Content-Type': 'application/json' };
    if (this.providerEntity.apiKey) {
      headers['Authorization'] = `Bearer ${this.providerEntity.apiKey}`;
    }
    const res = await fetch(`${this.providerEntity.apiBase}/rerank`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.modelId,
        query,
        top_n: options?.top_k || 10,
        documents,
        return_documents: options?.return_documents || false,
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const data: any = await res.json();

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
