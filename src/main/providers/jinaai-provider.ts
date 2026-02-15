import { Providers } from '@/entities/providers';
import { BaseProvider, RerankModel } from './base-provider';
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

export class JinaAIRerankModel implements RerankModel {
  modelId: string;
  providerEntity: Providers;
  readonly provider: string = 'jinaai';

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
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
    const headers = { 'Content-Type': 'application/json' };
    if (this.providerEntity.apiKey) {
      headers['Authorization'] = `Bearer ${this.providerEntity.apiKey}`;
    }
    const res = await fetch('https://api.jina.ai/v1/rerank', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.modelId || 'jina-reranker-v3',
        query,
        top_n: options?.top_k || 10,
        documents,
        return_documents: options?.return_documents || false,
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






export class JinaAIProvider extends BaseProvider {
  name: string = 'jinaai';
  type: ProviderType = ProviderType.JINA_AI;
  description: string;
  defaultApiBase?: string = 'https://api.jina.ai/v1';
  tags: ProviderTag[] = [
    ProviderTag.WEB_SEARCH,
    ProviderTag.WEB_READER,
    ProviderTag.EMBEDDING,
    ProviderTag.RERANKER,
  ];
  constructor(provider: Providers) {
    super({ provider });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return undefined;
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'jina-embeddings-v3', name: 'Jina Embeddings V3' }];
  }

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'jina-reranker-v3', name: 'Jina Reranker V3' }];
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
  rerankModel?(modelId: string): RerankModel {
    return new JinaAIRerankModel({ modelId, provider: this.provider });
  }
}
