import { customProvider, EmbeddingModel, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  EmbeddingModelV2,
  EmbeddingModelV2Embedding,
  ImageModelV2,
  JSONValue,
  LanguageModelV2,
  ProviderV2,
  SharedV2Headers,
  SpeechModelV2,
  TranscriptionModelV2,
  TranscriptionModelV2CallOptions,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
// import { TextEmbeddingPipeline, PoolingType } from 'openvino-genai-node';
import { BaseProvider, RerankModel } from './base-provider';
import { Providers } from '@/entities/providers';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
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
import { AudioLoader } from '../utils/loaders/audio-loader';
import { isString } from '@/utils/is';

export type LocalEmbeddingModelId = 'Qwen/Qwen3-Embedding-0.6B' | (string & {});

export type LocalConfig = {
  modelPath: string;
};

const localEmbeddings = {};
const localRerankers = {};
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
      throw new Error('Openvino not implemented.');
      // const { TextEmbeddingPipeline, PoolingType } = await import('openvino-genai-node')

      // const pipeline = await TextEmbeddingPipeline(modelPath);
      // embeddings = (await pipeline.embedDocuments(values)) as Float32Array[];
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
export class LocalRerankModel implements RerankModel {
  modelId: string;
  readonly provider: string = 'local';
  constructor(modelId: string) {
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
    const appInfo = await appManager.getInfo();
    const modelPath = path.join(appInfo.modelPath, 'reranker', this.modelId);

    const cachedModel = await localModelManager.ensureModelLoaded(
      'text-classification',
      this.modelId,
      modelPath,
      { dtype: 'q8' },
    );
    const { model, tokenizer } = cachedModel;

    const inputs = tokenizer(new Array(documents.length).fill(query), {
      text_pair: documents,
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    return logits
      .sigmoid()
      .tolist()
      .map(([score], i) => ({
        index: i,
        score,
        document: options?.return_documents ? documents[i] : undefined,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.top_k || 10);
  }
}

export class LocalClipModel {
  modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doClip({
    query,
    documents,
    images,
    options,
  }: {
    query: string;
    images: string;
    documents: string[];
    options?: {
      top_k?: number;
      return_documents?: boolean;
    };
  }): Promise<number[]> {
    const appInfo = await appManager.getInfo();
    const modelPath = path.join(appInfo.modelPath, 'clip', this.modelId);

    const cachedModel = await localModelManager.ensureModelLoaded(
      'image-feature-extraction',
      this.modelId,
      modelPath,
      { dtype: 'q8' },
    );
    const { model, processor } = cachedModel;

    const inputs = await processor(query, images, {
      padding: true,
      truncation: true,
    });

    const { l2norm_text_embeddings, l2norm_image_embeddings } =
      await model(inputs);

    const { logits } = await model(inputs);
    return logits
      .sigmoid()
      .tolist()
      .map(([score], i) => ({
        index: i,
        score,
        document: options?.return_documents ? documents[i] : undefined,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.top_k || 10);
  }
}


export class LocalTranscriptionModel implements TranscriptionModelV2 {
  specificationVersion: 'v2';
  provider: string = 'local';
  modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }


  async doGenerate(options: TranscriptionModelV2CallOptions): Promise<{ text: string; segments: Array<{ text: string; startSecond: number; endSecond: number; }>; language: string | undefined; durationInSeconds: number | undefined; warnings: Array<TranscriptionModelV2CallWarning>; request?: { body?: string; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
    let audio: Uint8Array<ArrayBufferLike>;
    if (isString(options.audio)) {
      audio = Buffer.from(options.audio, 'base64');
    } else {
      audio = options.audio
    }
    const audioLoader = new AudioLoader(new Blob([audio], { type: "application/octet-stream" }), {
      model: this.modelId,
      backend: process.platform !== "darwin" ? 'transformers' : 'mlx-audio',
      returnTimeStamps: true,
      outputType: 'txt',
    });
    const result = await audioLoader.load();
    return {
      text: result.text,
      segments: result.result.items.map(item => {
        return {
          text: item.text,
          startSecond: item.start,
          endSecond: item.end,
        }
      }),
      language: result.result.language,
      durationInSeconds: result.result.duration,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: options.headers,
        body: result,
      },
    };
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
  hasChatModel?: boolean = false;

  tags: ProviderTag[] = [ProviderTag.WEB_READER, ProviderTag.EMBEDDING, ProviderTag.RERANKER];
  constructor() {
    super();
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const models = [];
    const localModels = await localModelManager.getList();
    localModels.embedding
      .filter((x) => x.isDownloaded)
      .map((x) => {
        models.push({
          name: x.id,
          id: x.id,
        });
      });
    return models;
  }

  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    const models = [];
    const localModels = await localModelManager.getList();
    localModels.reranker
      .filter((x) => x.isDownloaded)
      .map((x) => {
        models.push({
          name: x.id,
          id: x.id,
        });
      });
    return models;
  }

  async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
    if (process.platform !== "darwin") {
      return [{ id: 'Qwen/Qwen3-ASR-1.7B', name: 'Qwen3-ASR-1.7B' },
      { id: 'Qwen/Qwen3-ASR-0.6B', name: 'Qwen3-ASR-0.6B' }];
    } else {
      return [{ id: 'mlx-community/Qwen3-ASR-1.7B-bf16', name: 'Qwen3-ASR-1.7B-bf16' },
      { id: 'mlx-community/Qwen3-ASR-0.6B-bf16', name: 'Qwen3-ASR-0.6B-bf16' }];
    }
  }

  // async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
  //   if (process.platform !== "darwin") {
  //     return [{ id: 'Qwen/Qwen3-TTS-1.7B', name: 'Qwen3-TTS-1.7B' },
  //     { id: 'Qwen/Qwen3-TTS-0.6B', name: 'Qwen3-TTS-0.6B' }];
  //   } else {
  //     return [{ id: 'mlx-community/Qwen3-TTS-1.7B-bf16', name: 'Qwen3-TTS-1.7B-bf16' },
  //     { id: 'mlx-community/Qwen3-TTS-0.6B-bf16', name: 'Qwen3-TTS-0.6B-bf16' }];
  //   }
  // }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return new LocalEmbeddingModel(modelId);
  }
  rerankModel(modelId: string): RerankModel {
    return new LocalRerankModel(modelId);
  }
  clipModel(modelId: string) {
    throw new Error('Method not implemented.');
  }
  imageModel(modelId: string): ImageModelV2 {
    throw new Error('Method not implemented.');
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return new LocalTranscriptionModel(modelId);
  }
  speechModel?(modelId: string): SpeechModelV2 {
    throw new Error('Method not implemented.');
  }
}
