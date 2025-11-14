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

export class ZhipuAIProvider extends BaseProvider {
  name: string = 'zhipuai';
  type: ProviderType = ProviderType.ZHIPUAI;
  description: string;
  defaultApiBase?: string = 'https://open.bigmodel.cn/api/paas/v4';

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
    return {
      url: this.provider.apiBase || this.defaultApiBase,
      id: `zhipuai/${modelId}` as `${string}/${string}`,
      apiKey: this.provider.apiKey,
    };
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [
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
