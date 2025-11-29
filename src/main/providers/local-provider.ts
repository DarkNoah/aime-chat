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
import { localModelManager } from '../local-model';
import { LocalModelTypes } from '@/types/local-model';
import {
  AutoProcessor,
  AutoTokenizer,
  AutoModelForSequenceClassification,
  RawImage,
  AutoModel,
  env,
  pipeline,
  ChineseCLIPModel,
  cos_sim,
  FeatureExtractionPipeline,
} from '@huggingface/transformers';

export type LocalEmbeddingModelId = 'Qwen/Qwen3-Embedding-0.6B' | (string & {});

export type LocalConfig = {
  modelPath: string;
};

const localEmbeddings = {};

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
    const appInfo = await appManager.getInfo();
    const modelName = this.modelId.split('/').pop();
    const localModels = await localModelManager.getList('embedding');
    const localModel = localModels.embedding.find((x) => x.id === this.modelId);
    const { library, isDownloaded } = localModel;
    if (!isDownloaded)
      throw new Error(`Model ${this.modelId} is not downloaded`);
    const modelPath = path.join(appInfo.modelPath, 'embedding', modelName);

    let embeddings: Float32Array[] = [];
    if (library == 'openvino') {
      const pipeline = await TextEmbeddingPipeline(modelPath);
      embeddings = (await pipeline.embedDocuments(values)) as Float32Array[];
    } else if (library == 'transformers') {
      if (localModels[this.modelId] == null) {
        // const { pipeline, env } = await this.TransformersApi;
        env.localModelPath = path.dirname(modelPath);
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        localModels[this.modelId] = await pipeline(
          'feature-extraction',
          path.basename(modelPath),
        );
      }

      const featureExtractionPipeline = localModels[
        this.modelId
      ] as FeatureExtractionPipeline;
      const output = await featureExtractionPipeline(values, {
        pooling: 'cls',
        normalize: true,
      });
      const res = output.tolist();
      embeddings = res.map((x) => new Float32Array(x));
    }

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
export class LocalRerankModel {
  modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async rerank({
    query,
    documents,
  }: {
    query: string;
    documents: string[];
  }): Promise<number[]> {
    throw new Error('Method not implemented.');
  }
}
// export const localProvider = customProvider({
//   textEmbeddingModels: {
//     embedding: new LocalEmbeddingModel('Qwen/Qwen3-Embedding-0.6B'),
//   },
//   // no fallback provider
// });

export class LocalProvider extends BaseProvider {
  id: string = ProviderType.LOCAL;
  type: ProviderType = ProviderType.LOCAL;
  name: string = 'Local';
  description: string;
  defaultApiBase?: string;

  constructor() {
    super();
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const models = [];
    const appInfo = await appManager.getInfo();
    const embeddingModels = await localModelManager.getList();
    embeddingModels.embedding
      .filter((x) => x.isDownloaded)
      .map((x) => {
        models.push({
          name: x.id,
          id: x.id,
        });
      });
    return models;
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return new LocalEmbeddingModel(modelId);
  }
  rerankModel(modelId: string) {
    return new LocalRerankModel(modelId);
  }
  clipModel(modelId: string) {
    throw new Error('Method not implemented.');
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
