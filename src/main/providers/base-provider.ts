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

export interface BaseProviderParams {
  provider: Providers;
}

export abstract class BaseProvider implements ProviderV2 {
  id: string;
  abstract name: string;
  abstract type: ProviderType;
  abstract description?: string;

  abstract defaultApiBase?: string;

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

  abstract getLanguageModelList(): Promise<{ name: string; id: string }[]>;

  abstract getEmbeddingModelList(): Promise<{ name: string; id: string }[]>;

  abstract getRerankModelList(): Promise<{ name: string; id: string }[]>;

  getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    throw new Error('Method not implemented.');
  }

  abstract getCredits(): Promise<ProviderCredits | undefined>;
}
