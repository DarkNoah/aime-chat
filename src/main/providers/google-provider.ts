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
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProvider,
} from '@ai-sdk/google';

export class GoogleProvider extends BaseProvider {
  name: string = 'google';
  type: ProviderType = ProviderType.GOOGLE;
  description: string;
  defaultApiBase?: string = 'https://generativelanguage.googleapis.com/v1beta';

  google: GoogleGenerativeAIProvider;

  constructor(provider: Providers) {
    super({ provider });
    this.google = createGoogleGenerativeAI({
      apiKey: this.provider.apiKey,
      baseURL: this.provider.apiBase || this.defaultApiBase,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return this.google.languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const options = {
      method: 'GET',
    };
    const url = `${this.provider.apiBase || this.defaultApiBase}/models?key=${this.provider.apiKey}`;
    const res = await fetch(url, options);
    const data = await res.json();
    const models = data.models
      .filter((x) => x.supportedGenerationMethods.includes('generateContent'))
      .map((x) => {
        return { id: x.name.split('/')[1], name: x.displayName };
      });
    return models;
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const options = {
      method: 'GET',
    };
    const url = `${this.provider.apiBase || this.defaultApiBase}/models?key=${this.provider.apiKey}`;
    const res = await fetch(url, options);
    const data = await res.json();
    const models = data.models
      .filter((x) => x.supportedGenerationMethods.includes('embedContent'))
      .map((x) => {
        return { id: x.name.split('/')[1], name: x.displayName };
      });
    return models;
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return this.google.textEmbeddingModel(modelId);
  }
  imageModel(modelId: string): ImageModelV2 {
    return this.google.imageModel(modelId);
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
}
