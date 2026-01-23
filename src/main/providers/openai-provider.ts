import { Providers } from '@/entities/providers';
import { BaseProvider } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAIProvider as OpenAIProviderSDK } from '@ai-sdk/openai';
import { OpenAICompatibleConfig } from '@mastra/core/llm';
export class OpenAIProvider extends BaseProvider {
  name: string = 'openai';
  type: ProviderType = ProviderType.OPENAI;
  description: string;
  defaultApiBase?: string = 'https://api.openai.com/v1';

  openaiClient?: OpenAI;

  openai?: OpenAIProviderSDK;

  tags: ProviderTag[] = [ProviderTag.WEB_SEARCH];

  constructor(provider: Providers) {
    super({ provider });
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
      // fetchOptions:{
      //   agent:
      // }
    });

    this.openai = createOpenAI({
      apiKey: this.provider.apiKey,
      baseURL: this.provider.apiBase || this.defaultApiBase,
    });
  }

  languageModel(modelId: string): LanguageModelV2 | OpenAICompatibleConfig {
    return {
      id: "openai/"+ modelId,
      apiKey: this.provider.apiKey,
      url: this.provider.apiBase || this.defaultApiBase,
    } as OpenAICompatibleConfig

    return createOpenAI({
      name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const list = await this.openaiClient.models.list();
    return list.data
      .filter(
        (x) =>
          !(
            x.id.startsWith('text-embedding-') ||
            x.id.startsWith('gpt-realtime-') ||
            x.id.startsWith('gpt-audio-')
          ),
      )
      .map((x) => {
        return { id: x.id, name: x.id };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const list = await this.openaiClient.models.list();
    return list.data
      .filter((x) => x.id.startsWith('text-'))
      .map((x) => {
        return { id: x.id, name: x.id };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }

  async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'dall-e-3', name: 'Dall-E 3' }];
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return createOpenAI({
      name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).textEmbeddingModel(modelId);
  }
  imageModel(modelId: string): ImageModelV2 {
    return createOpenAI({
      // name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).imageModel(modelId);
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return createOpenAI({
      name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).transcriptionModel(modelId);
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return createOpenAI({
      name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).speechModel(modelId);
  }
}
