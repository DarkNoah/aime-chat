import { ModelRouterEmbeddingModel } from '@mastra/core';
import { customProvider, EmbeddingModel, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  EmbeddingModelV2,
  EmbeddingModelV2Embedding,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { TextEmbeddingPipeline, PoolingType } from 'openvino-genai-node';
import { BaseProvider } from './base-provider';
import { Providers } from '@/entities/providers';
import { ProviderCredits, ProviderType } from '@/types/provider';
import fs from 'fs';
import path from 'path';
import { appManager } from '../app';

export type LocalEmbeddingModelId = 'Qwen/Qwen3-Embedding-0.6B' | (string & {});

export type LocalConfig = {
  modelPath: string;
};

export class LocalEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly modelId: LocalEmbeddingModelId;
  readonly config: LocalConfig;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

  get provider(): string {
    return 'local';
  }

  constructor(modelId: LocalEmbeddingModelId, config?: LocalConfig) {
    this.modelId = modelId;
    this.config = config;
  }

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV2<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>
  > {
    //const device = 'CPU'; // GPU can be used as well

    const pipeline = await TextEmbeddingPipeline(this.config.modelPath);

    const embeddings = (await pipeline.embedDocuments(
      values,
    )) as Float32Array[];
    const array = [];
    for (const embedding of embeddings) {
      const data = Array.from(embedding);
      array.push(data);
    }

    return {
      embeddings: array,
      usage: {
        tokens: 0,
      },
    };
  }
}

export const localProvider = customProvider({
  textEmbeddingModels: {
    embedding: new LocalEmbeddingModel('Qwen/Qwen3-Embedding-0.6B'),
  },
  // no fallback provider
});

export class LocalProvider extends BaseProvider {
  type: ProviderType = ProviderType.LOCAL;
  name: string = 'local';
  description: string;
  defaultApiBase?: string;

  constructor(provider: Providers) {
    super({ provider });
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const models = [];
    const appInfo = await appManager.getInfo();
    if (fs.existsSync(path.join(appInfo.modelPath, 'Qwen3-Embedding-0.6B'))) {
      models.push({
        name: 'Qwen3-Embedding-0.6B',
        id: 'Qwen/Qwen3-Embedding-0.6B',
      });
    }
    return models;
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return new LocalEmbeddingModel(modelId);
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
