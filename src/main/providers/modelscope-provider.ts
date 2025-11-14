import { Providers } from '@/entities/providers';
import { BaseProvider } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ProviderCredits, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';

export class ModelScopeProvider extends BaseProvider {
  name: string = 'modelscope';
  type: ProviderType = ProviderType.MODELSCOPE;
  description: string;
  defaultApiBase?: string = 'https://api-inference.modelscope.cn/v1';

  openaiClient?: OpenAI;

  constructor(provider: Providers) {
    super({ provider });
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return {
      url: this.provider.apiBase || this.defaultApiBase,
      id: `modelscope/${modelId}`,
      apiKey: this.provider.apiKey,
    };
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const models = (await this.openaiClient.models.list()).data;
    return models.map((x) => {
      return { id: x.id, name: x.id };
    });
  }

  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [];
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
    return undefined;
  }
}
