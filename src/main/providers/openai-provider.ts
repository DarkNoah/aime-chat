import { Providers } from '@/entities/providers';
import { BaseImageModelV2CallOptions, BaseProvider } from './base-provider';
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
import { createOpenResponses } from '@ai-sdk/open-responses';
import { isString } from '@/utils/is';



export class OpenAIImageModel implements ImageModelV2 {
  specificationVersion: 'v2' = 'v2';
  provider: string = 'openai';
  modelId: string;
  providerEntity: Providers;

  private baseUrl: string;
  private readonly pollingInterval = 5000; // 5 seconds
  private readonly maxPollingAttempts = 60; // 5 minutes max

  constructor({ modelId, provider }: { modelId: string; provider: Providers }) {
    this.providerEntity = provider;
    this.modelId = modelId;
    this.baseUrl = (provider.apiBase || "https://api.openai.com/v1").replace(/\/+$/, '');
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
    let mask: string | undefined;

    if (typeof options.prompt === 'string') {
      promptText = options.prompt;
    } else {
      promptText = options.prompt.text;
      // Convert images to URLs (filter out Buffer types)
      imageUrls = options.prompt.images
        ?.filter((img): img is string => typeof img === 'string')
        .filter((img) => img.startsWith('http'));
      if (options.prompt.mask) {
        mask = isString(options.prompt.mask) ? options.prompt.mask : options.prompt.mask.toString('base64');
      }

    }

    // Build request body
    let requestBody: Record<string, unknown> = {
      model: this.modelId,
      prompt: promptText,
      size: options.size ?? 'auto',
      n: options.n ?? 1,
    };

    // Add image_url for image editing models
    if (imageUrls && imageUrls.length > 0) {
      requestBody.images = imageUrls.map((url) => ({ image_url: url }));
    }


    if (mask) {
      requestBody.mask = {
        image_url: mask,
      }
    }

    if (options?.providerOptions?.openai) {
      requestBody = { ...requestBody, ...options?.providerOptions?.openai }
    }



    const requestOptions = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.providerEntity.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    };

    // Submit async task
    const res = await fetch(imageUrls && imageUrls.length > 0 ? `${this.baseUrl}/images/edit` : `${this.baseUrl}/images/generations`, {
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
      id: "openai/" + modelId,
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
    const list = await this.openaiClient.models.list({
      timeout: 2000,
    });
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
    const list = await this.openaiClient.models.list({
      timeout: 2000,
    });
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
    return [{ id: 'gpt-image-1.5', name: 'GPT Image 1.5' }, {
      id: 'gpt-image-1', name: 'GPT Image 1'
    }, { id: 'dall-e-3', name: 'Dall-E 3' }];
  }

  async getSpeechModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'tts-1', name: 'TTS-1' },
    { id: 'tts-1-hd', name: 'TTS-1 HD' },
    { id: 'gpt-4o-mini-tts-2025-12-15', name: 'GPT-4o Mini TTS' },
    ];
  }

  async getTranscriptionModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'whisper-1', name: 'Whisper 1' },
    { id: "gpt-4o-transcribe", name: "GPT-4o Transcribe" }];
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
    return new OpenAIImageModel({ modelId, provider: this.provider });
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
