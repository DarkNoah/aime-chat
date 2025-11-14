import { Providers } from '@/entities/providers';
import { EmbeddingModel, LanguageModel } from 'ai';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import OpenAI from 'openai';
import { ZodSchema } from 'zod';
import { ProviderCredits, ProviderType } from '@/types/provider';
import { MastraModelConfig } from '@mastra/core/llm';
import { MastraLanguageModel } from '@mastra/core';

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

  constructor(params?: BaseProviderParams) {
    this.provider = params?.provider;
    this.id = params?.provider.id;
  }

  languageModel(modelId: string): LanguageModelV2 {
    throw new Error('Method not implemented.');
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    throw new Error('Method not implemented.');
  }
  imageModel(modelId: string): ImageModelV2 {
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

  abstract getCredits(): Promise<ProviderCredits | undefined>;
}
