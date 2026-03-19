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
  SpeechModelV2CallOptions,
  SpeechModelV2CallWarning,
  TranscriptionModelV2,
  TranscriptionModelV2CallOptions,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
// import { TextEmbeddingPipeline, PoolingType } from 'openvino-genai-node';
import { BaseProvider, OCRModel, RerankModel } from './base-provider';
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
import { AudioLoader, getQwenAsrPythonService } from '../utils/loaders/audio-loader';
import { isString } from '@/utils/is';
import { getPaddleOcrPythonService } from '../utils/loaders/ocr-loader';
import { OcrAccuracy, recognize } from '@napi-rs/system-ocr';
import { getPaddleOcrRuntime } from '../app/runtime';

export type LocalEmbeddingModelId = 'Qwen/Qwen3-Embedding-0.6B' | (string & {});

export type LocalConfig = {
  modelPath: string;
};

// const localEmbeddings = {};
// const localRerankers = {};
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
    const localClipModels = await localModelManager.getList('clip');
    const localEmbeddingModel = localModels.embedding.find((x) => x.id === this.modelId);
    const localClipModel = localClipModels.clip.find((x) => x.id === this.modelId);
    const { library, isDownloaded } = localEmbeddingModel ?? {};
    const { library: clipLibrary, isDownloaded: clipIsDownloaded } = localClipModel ?? {};
    let isEmbedModel;
    if (localEmbeddingModel) {
      isEmbedModel = true;
      if (!isDownloaded)
        throw new Error(`Model ${this.modelId} is not downloaded`);
    }
    if (localClipModel) {
      isEmbedModel = false;
      if (!clipIsDownloaded)
        throw new Error(`Model ${this.modelId} is not downloaded`);
    }






    const modelPath = path.join(appInfo.modelPath, isEmbedModel ? 'embedding' : 'clip', modelName);

    let embeddings: Float32Array[] = [];
    if (library == 'openvino') {
      throw new Error('Openvino not implemented.');
      // const { TextEmbeddingPipeline, PoolingType } = await import('openvino-genai-node')

      // const pipeline = await TextEmbeddingPipeline(modelPath);
      // embeddings = (await pipeline.embedDocuments(values)) as Float32Array[];
    } else if (library == 'transformers') {
      let cachedModel;
      if (isEmbedModel) {
        cachedModel = await localModelManager.ensureModelLoaded(
          'feature-extraction',
          this.modelId,
          modelPath
        );
      } else {
        cachedModel = await localModelManager.ensureModelLoaded(
          'image-feature-extraction',
          this.modelId,
          modelPath
        );

      }



      const { model, tokenizer, processor } = cachedModel;


      if (!isEmbedModel) {

        const sentences = values.map(x => x);
        const images = await Promise.all(values.map(url => RawImage.read(url)));
        const inputs = await processor(sentences, images, { padding: true, truncation: true });
        const { l2norm_text_embeddings, l2norm_image_embeddings } = await model(inputs);

      }

      // if (localEmbeddings[this.modelId] == null) {
      //   // const { pipeline, env } = await this.TransformersApi;
      //   env.localModelPath = path.dirname(modelPath);
      //   env.allowRemoteModels = false;
      //   env.allowLocalModels = true;
      //   localEmbeddings[this.modelId] = await pipeline(
      //     'feature-extraction',
      //     path.basename(modelPath),
      //     {
      //       dtype: 'q8'
      //     }
      //   );
      // }

      // const featureExtractionPipeline = localEmbeddings[
      //   this.modelId
      // ] as FeatureExtractionPipeline;

      const inputs = tokenizer(values, {
        padding: true,
        truncation: true
      });
      const outputs = await model(inputs, {
        pooling: 'cls',
        normalize: true,
      });

      function clsNormalize(outputs) {
        const hidden = outputs.last_hidden_state.tolist();

        return hidden.map(seq => {
          let vec = seq[0]; // CLS pooling

          const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
          return vec.map(v => v / norm);
        });
      }

      const embeddings2 = clsNormalize(outputs);


      // const output = await featureExtractionPipeline(values, {
      //   pooling: 'cls',
      //   normalize: true,
      // });
      const res = embeddings2;
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
    texts = [],
    images = [],
    options,
  }: {
    texts?: string[];
    images?: string[];
    options?: {
      top_k?: number;
      return_documents?: boolean;
    };
  }): Promise<{ image_embeddings?: number[][]; text_embeddings?: number[][] }> {
    const appInfo = await appManager.getInfo();
    const modelPath = path.join(appInfo.modelPath, 'clip', this.modelId);

    const cachedModel = await localModelManager.ensureModelLoaded(
      'zero-shot-image-classification',
      this.modelId,
      modelPath
    );
    const { model, processor, tokenizer, textModel } = cachedModel;
    if (this.modelId == 'jina-clip-v2' || this.modelId == 'chinese-clip-vit-large-patch14-336px') {
      const rawImages = [];
      if (images.length > 0) {
        for (const image of images) {
          const rawImage = await RawImage.read(image);
          rawImages.push(rawImage);
        }
      }
      const inputTexts = [];
      for (const text of texts) {
        if (text && text.trim() != '')
          inputTexts.push(text);
      }

      const inputs = await processor(
        inputTexts.length > 0 ? inputTexts : null,
        rawImages.length > 0 ? rawImages : null,
        { padding: true, truncation: true }
      );
      const outputs = await model(inputs);


      return {
        image_embeddings: outputs.l2norm_image_embeddings?.tolist(),
        text_embeddings: outputs.l2norm_text_embeddings?.tolist()
      }

    }

    let text_embeddings;
    if (texts && texts.length > 0) {
      const text_inputs = tokenizer(texts, { padding: true, truncation: true });

      const output = await textModel(text_inputs);
      text_embeddings = output.text_embeds?.tolist();
    }



    const rawImages = [];
    for (const image of images) {
      const rawImage = await RawImage.read(image);
      rawImages.push(rawImage);
    }
    let image_embeddings;
    if (rawImages.length > 0) {
      const imageInputs = await processor(rawImages);
      const results = await model(imageInputs);
      image_embeddings = results.image_embeds.tolist();
    }

    // const inputs = await processor(contents, images, {
    //   padding: true,
    //   truncation: true,
    // });

    // const results = await model(inputs);
    // const l2norm_text_embeddings = results.l2norm_text_embeddings.tolist();
    // const text_embeddings = results.text_embeddings.tolist();

    return {
      image_embeddings,
      text_embeddings
    }

    // const { logits } = await model(inputs);
    // return logits
    //   .sigmoid()
    //   .tolist()
    //   .map(([score], i) => ({
    //     index: i,
    //     score,
    //     document: options?.return_documents ? documents[i] : undefined,
    //   }))
    //   .sort((a, b) => b.score - a.score)
    //   .slice(0, options?.top_k || 10);
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
      segments: result.items.map(item => {
        return {
          text: item.text,
          startSecond: item.start,
          endSecond: item.end,
        }
      }),
      language: result.language,
      durationInSeconds: result.duration,
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
export class LocalSpeechModel implements SpeechModelV2 {
  specificationVersion: 'v2';
  provider: string = 'local';
  modelId: string;

  constructor(modelId: string) {
    this.modelId = modelId;
  }
  async doGenerate(options: SpeechModelV2CallOptions): Promise<{ audio: string | Uint8Array; warnings: Array<SpeechModelV2CallWarning>; request?: { body?: unknown; }; response: { timestamp: Date; modelId: string; headers?: SharedV2Headers; body?: unknown; }; providerMetadata?: Record<string, Record<string, JSONValue>>; }> {
    const service = await getQwenAsrPythonService();
    const result = await service.synthesize({
      text: options.text,
      language: options.language,
      voice: options.voice,
      instruct: options.instructions,
      ref_audio: options.providerOptions?.['local']?.ref_audio as string | undefined,
      ref_text: options.providerOptions?.['local']?.ref_text as string | undefined,
      outputPath: options.providerOptions?.['local']?.outputPath as string | undefined,
    });
    return {
      audio: await fs.promises.readFile(result.outputPath),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: options.headers,
        body: result,
      },
      providerMetadata: {
        "local": {
          "outputPath": result.outputPath,
          "sampleRate": result.sampleRate,
          "duration": result.duration,
        }
      }
    };
  }
}
// export const localProvider = customProvider({
//   textEmbeddingModels: {
//     embedding: new LocalEmbeddingModel('Qwen/Qwen3-Embedding-0.6B'),
//   },
//   // no fallback provider
// });
export class LocalOcrModel implements OCRModel {
  provider: string = 'local';
  modelId: string;
  constructor(modelId: string) {
    this.modelId = modelId;
  }
  async doOCR(options: { image: string }): Promise<string> {
    const image = fs.readFileSync(options.image);
    let result;
    if (this.modelId === 'system') {
      if (path.extname(options.image).toLowerCase() === '.pdf') {
        return await this.ocrPdf(image);
      }
      try {
        result = await recognize(image, OcrAccuracy.Accurate);
        return result.text;
      } catch (err) {
        if (err.code == 'GenericFailure') {
          return ''
        }
        throw err;
      }
    }
    const paddleOcrRuntime = await getPaddleOcrRuntime();
    if (paddleOcrRuntime.status !== 'installed') {
      throw new Error('PaddleOCR Runtime is not installed');
    }
    const service = await getPaddleOcrPythonService();
    result = await service.recognize(image.buffer, {
      noCache: false,
      ext: path.extname(options.image).toLowerCase(),
      modelId: this.modelId,
    });
    return result.text;


    // const ocrLoader = new OcrLoader(options.image, {
    //   modelId: this.modelId,
    //   // mode: 'auto',
    // });
    // const result = await ocrLoader.load();
    // return result.text;
  }

  private async ocrPdf(raw: Buffer): Promise<string> {
    const pdfjs = await import('pdf-parse');
    const pdf = new pdfjs.PDFParse({
      data: new Uint8Array(raw.buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    const images = await pdf.getImage({ imageBuffer: true });
    const texts: string[] = [];

    for (const page of images.pages) {
      let pageText = '';
      for (const image of page.images) {
        const result = await recognize(image.data, OcrAccuracy.Accurate);
        pageText += result.text;
      }
      texts.push(pageText);
    }

    await pdf.destroy();
    return texts.join('\n\n');
  }
}
export class LocalProvider extends BaseProvider {

  id: string = ProviderType.LOCAL;
  type: ProviderType = ProviderType.LOCAL;
  name: string = 'Local';
  description: string;
  defaultApiBase?: string;
  hasChatModel?: boolean = false;

  tags: ProviderTag[] = [ProviderTag.WEB_READER, ProviderTag.EMBEDDING, ProviderTag.RERANKER, ProviderTag.OCR];
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
    for (const model of localModels.clip) {
      if (model.isDownloaded) {
        models.push({
          name: model.id,
          id: model.id,
        });
      }
    }
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

  async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
    if (process.platform !== "darwin") {
      return [{ id: 'Qwen/Qwen3-TTS-1.7B', name: 'Qwen3-TTS-1.7B' },
      { id: 'Qwen/Qwen3-TTS-0.6B', name: 'Qwen3-TTS-0.6B' }];
    } else {
      return [{ id: 'mlx-community/Qwen3-TTS-1.7B-bf16', name: 'Qwen3-TTS-1.7B-bf16' },
      { id: 'mlx-community/Qwen3-TTS-0.6B-bf16', name: 'Qwen3-TTS-0.6B-bf16' }];
    }
  }

  async getOCRModelList(): Promise<{ name: string; id: string; }[]> {
    if (process.platform == "darwin") {
      return [{ id: 'system', name: 'System OCR' },
      { id: 'paddleocr-vl', name: 'PaddleOCR-V1.5' },
      { id: 'pp-structurev3', name: 'PP-StructureV3' },
      { id: 'mlx-community/GLM-OCR-bf16', name: 'GLM-OCR' }
      ];
    } else {
      return [{ id: 'system', name: 'System OCR' }, {
        id: 'paddleocr-vl', name: 'PaddleOCR-V1.5'
      }, { id: 'pp-structurev3', name: 'PP-StructureV3' }
      ]
    }

  }

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
    return new LocalSpeechModel(modelId);
  }
  ocrModel(modelId: string): OCRModel {
    return new LocalOcrModel(modelId);
  }
}
