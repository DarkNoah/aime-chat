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

export class LmstudioProvider extends BaseProvider {
  name: string = 'lmstudio';
  type: ProviderType = ProviderType.LMSTUDIO;
  description: string;
  defaultApiBase?: string = 'http://127.0.0.1:1234/v1';

  openaiClient?: OpenAI;

  constructor(provider: Providers) {
    super({ provider });
    //this.provider = provider;
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const list = await this.openaiClient.models.list();
    return list.data
      .filter((x) => !x.id.startsWith('text-embedding-'))
      .map((x) => {
        return { id: x.id, name: x.id };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    // const models = [];
    const list = await this.openaiClient.models.list();
    return list.data
      .filter((x) => x.id.startsWith('text-embedding-'))
      .map((x) => {
        return { id: x.id, name: x.id };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }

  languageModel(modelId: string): LanguageModelV2 {
    return createOpenAICompatible({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
      name: this.provider.name,
    }).languageModel(modelId);
  }

  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return createOpenAICompatible({
      name: 'lmstudio',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).textEmbeddingModel(modelId);
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
}
