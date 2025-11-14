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
import { createDeepSeek } from '@ai-sdk/deepseek';

export class DeepSeekProvider extends BaseProvider {
  name: string = 'deepseek';
  type: ProviderType = ProviderType.DEEPSEEK;
  description: string;
  defaultApiBase?: string = 'https://api.deepseek.com';

  openaiClient?: OpenAI;

  constructor(provider: Providers) {
    super({ provider });
    //this.provider = provider;
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return createOpenAICompatible({
      name: 'deepseek',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const list = await this.openaiClient.models.list();
    return list.data
      .map((x) => {
        return { id: x.id, name: x.id };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
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
