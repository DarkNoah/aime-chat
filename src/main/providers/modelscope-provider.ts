import { Providers } from '@/entities/providers';
import { BaseImageModelV2CallOptions, BaseProvider } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ProviderCredits, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';

export class ModelScopeImageModel implements ImageModelV2 {
  specificationVersion: 'v2' = 'v2';
  provider: string = 'modelscope';
  modelId: string;
  providerEntity: Providers;

  private readonly baseUrl = 'https://api-inference.modelscope.cn/';
  private readonly pollingInterval = 5000; // 5 seconds
  private readonly maxPollingAttempts = 60; // 5 minutes max

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
    this.modelId = modelId;
  }

  maxImagesPerCall:
    | number
    | ((options: {
        modelId: string;
      }) => PromiseLike<number | undefined> | number | undefined) = 1;

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async pollTaskResult(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<string[]> {
    const headers = {
      Authorization: `Bearer ${this.providerEntity.apiKey}`,
      'Content-Type': 'application/json',
      'X-ModelScope-Task-Type': 'image_generation',
    };

    for (let attempt = 0; attempt < this.maxPollingAttempts; attempt++) {
      if (abortSignal?.aborted) {
        throw new Error('Request aborted');
      }

      const res = await fetch(`${this.baseUrl}v1/tasks/${taskId}`, {
        method: 'GET',
        headers,
        signal: abortSignal,
      });

      if (!res.ok) {
        throw new Error(`Failed to get task status: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.task_status === 'SUCCEED') {
        return data.output_images || [];
      } else if (data.task_status === 'FAILED') {
        throw new Error(data.error?.message || 'Image generation failed');
      }

      // Task still processing, wait and retry
      await this.sleep(this.pollingInterval);
    }

    throw new Error('Image generation timed out');
  }

  async doGenerate(options: BaseImageModelV2CallOptions): Promise<{
    images: Array<string> | Array<Uint8Array>;
    warnings: Array<ImageModelV2CallWarning>;
    providerMetadata?: ImageModelV2ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    // Extract prompt text and image URLs
    let promptText: string;
    let imageUrls: string[] | undefined;

    if (typeof options.prompt === 'string') {
      promptText = options.prompt;
    } else {
      promptText = options.prompt.text;
      // Convert images to URLs (filter out Buffer types)
      imageUrls = options.prompt.images
        ?.filter((img): img is string => typeof img === 'string')
        .filter((img) => img.startsWith('http'));
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt: promptText,
    };

    // Add image_url for image editing models
    if (imageUrls && imageUrls.length > 0) {
      requestBody.image_url = imageUrls;
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.providerEntity.apiKey}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Async-Mode': 'true',
      },
      body: JSON.stringify(requestBody),
    };

    // Submit async task
    const res = await fetch(`${this.baseUrl}v1/images/generations`, {
      ...requestOptions,
      signal: options.abortSignal,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Request failed: ${res.statusText}`,
      );
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const taskId = data.task_id;
    if (!taskId) {
      throw new Error('No task_id returned from API');
    }

    // Poll for result
    const outputImages = await this.pollTaskResult(taskId, options.abortSignal);

    return {
      images: outputImages,
      warnings: [],
      providerMetadata: undefined,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }
}

export class ModelScopeProvider extends BaseProvider {
  name: string = 'modelscope';
  type: ProviderType = ProviderType.MODELSCOPE;
  description: string;
  defaultApiBase?: string = 'https://api-inference.modelscope.cn/v1';

  openaiClient?: OpenAI;

  constructor(provider: Providers) {
    super({ provider });
    this.openaiClient = new OpenAI({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return {
      url: this.defaultApiBase,
      id: `modelscope/${modelId}`,
      apiKey: this.provider.apiKey,
    };
    // return createOpenAICompatible({
    //   baseURL: this.defaultApiBase,
    //   apiKey: this.provider.apiKey,
    //   name: this.provider.name,
    // }).languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const models = (await this.openaiClient.models.list()).data;
    return models.map((x) => {
      return { id: x.id, name: x.id };
    });
  }

  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }

  async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    return [
      { id: 'Qwen/Qwen-Image-Edit-2511', name: 'Qwen-Image-Edit-2511' },
      { id: 'Qwen/Qwen-Image-2512', name: 'Qwen-Image-2512' },
      { id: 'Qwen/Qwen-Image', name: 'Qwen-Image' },
    ];
  }
  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return undefined;
  }
  imageModel(modelId: string): ImageModelV2 {
    return new ModelScopeImageModel({ modelId, provider: this.provider });
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
}
