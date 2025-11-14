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
import { Ollama } from 'ollama';

export class OllamaProvider extends BaseProvider {
  name: string = 'ollama';
  type: ProviderType = ProviderType.OLLAMA;
  description: string;
  defaultApiBase?: string = 'http://localhost:11434';

  ollamaClient?: Ollama;

  constructor(provider: Providers) {
    super({ provider });
    this.ollamaClient = new Ollama({
      host: this.provider.apiBase || this.defaultApiBase,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return createOpenAICompatible({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
      name: 'ollama',
    }).languageModel(modelId);
    // return {
    //   url: this.provider.apiBase || this.defaultApiBase,
    //   id: `ollama/${modelId}`,
    //   apiKey: this.provider.apiKey,
    // };
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const models = (await this.ollamaClient.list()).models;
    return models.map((x) => {
      return { id: x.model, name: x.name };
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
