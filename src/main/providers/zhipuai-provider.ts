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
import { createZhipu } from 'zhipu-ai-provider';

export class ZhipuAIRerankModel {
  modelId: string;
  provider: Providers;

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.provider = provider;
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
    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId || 'rerank',
        query: query,
        top_n: options?.top_k || 10,
        documents: documents,
      }),
    });

    const data = await res.json();

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

export class ZhipuAIProvider extends BaseProvider {
  name: string = 'zhipuai';
  type: ProviderType = ProviderType.ZHIPUAI;
  description: string;
  defaultApiBase?: string = 'https://open.bigmodel.cn/api/paas/v4';

  openaiClient?: OpenAI;

  tags: ProviderTag[] = [ProviderTag.WEB_SEARCH, ProviderTag.WEB_READER];

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
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4.6v', name: 'GLM-4.6V' },
      { id: 'glm-4.6v-flash', name: 'GLM-4.6V-Flash' },
      { id: 'autoglm-phone', name: 'AutoGLM-Phone' },
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

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'rerank', name: 'Rerank' }];
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
  rerankModel(modelId: string) {
    return new ZhipuAIRerankModel({ modelId, provider: this.provider });
  }
}
