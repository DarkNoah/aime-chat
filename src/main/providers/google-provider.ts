import { Providers } from '@/entities/providers';
import { BaseImageModelV2CallOptions, BaseProvider } from './base-provider';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { lookup } from 'mime-types';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createZhipu } from 'zhipu-ai-provider';
import {
  createGoogleGenerativeAI,
  GoogleGenerativeAIProvider,
} from '@ai-sdk/google';
import { GoogleGenAI } from '@google/genai';
import { isArray, isObject, isString } from '@/utils/is';

export class GoogleProvider extends BaseProvider {
  name: string = 'google';
  type: ProviderType = ProviderType.GOOGLE;
  description: string;
  defaultApiBase?: string = 'https://generativelanguage.googleapis.com/v1beta';

  google: GoogleGenerativeAIProvider;
  ai: GoogleGenAI;

  tags: ProviderTag[] = [ProviderTag.WEB_SEARCH];

  constructor(provider: Providers) {
    super({ provider });
    this.google = createGoogleGenerativeAI({
      apiKey: this.provider.apiKey,
      baseURL: this.provider.apiBase || this.defaultApiBase,
    });
    this.ai = new GoogleGenAI({
      apiKey: this.provider.apiKey,
      httpOptions: {
        baseUrl: this.provider?.apiBase || undefined,
      },
    });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return this.google.languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    const options = {
      method: 'GET',
    };
    const url = `${this.provider.apiBase || this.defaultApiBase}/models?key=${this.provider.apiKey}`;
    const res = await fetch(url, options);
    let data: {
      nextPageToken?: string;
      models: {
        name: string;
        displayName: string;
        supportedGenerationMethods: string[];
      }[];
    } = await res.json();

    const models = data.models
      .filter((x) => x.supportedGenerationMethods.includes('generateContent'))
      .map((x) => {
        return { id: x.name.split('/')[1], name: x.displayName };
      });
    while (true) {
      if (!data.nextPageToken) break;
      const res = await fetch(`${url}&pageToken=${data.nextPageToken}`);
      data = await res.json();
      models.push(
        ...data.models
          .filter((x) =>
            x.supportedGenerationMethods.includes('generateContent'),
          )
          .map((x) => {
            return { id: x.name.split('/')[1], name: x.displayName };
          }),
      );
    }

    return models;
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    const options = {
      method: 'GET',
    };
    const url = `${this.provider.apiBase || this.defaultApiBase}/models?key=${this.provider.apiKey}`;
    const res = await fetch(url, options);
    const data = await res.json();
    const models = data.models
      .filter((x) => x.supportedGenerationMethods.includes('embedContent'))
      .map((x) => {
        return { id: x.name.split('/')[1], name: x.displayName };
      });
    return models;
  }
  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }

  async getImageGenerationList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro' }];
  }
  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return this.google.textEmbeddingModel(modelId);
  }
  imageModel(modelId: string): ImageModelV2 {
    if (modelId != 'gemini-3-pro-image-preview')
      return this.google.imageModel(modelId);
    const model = this.google.imageModel(modelId);
    model.doGenerate = async (
      options: BaseImageModelV2CallOptions,
    ): Promise<{
      images: string[] | Uint8Array<ArrayBufferLike>[];
      warnings: ImageModelV2CallWarning[];
      providerMetadata?: ImageModelV2ProviderMetadata;
      response: {
        timestamp: Date;
        modelId: string;
        headers: Record<string, string> | undefined;
      };
    }> => {
      const contents = [];

      if (isString(options.prompt)) {
        contents.push({ text: options.prompt });
      } else if (isObject(options.prompt)) {
        const { text, images, mask } = options.prompt;
        if (text) {
          contents.push({ text: text });
        }
        if (images) {
          for (const image of images) {
            if (isString(image)) {
              const mime = lookup(image);
              contents.push({
                inlineData: {
                  mimeType: mime || 'image/jpeg',
                  data: (await fs.promises.readFile(image as string)).toString(
                    'base64',
                  ),
                },
              });
            } else if (Buffer.isBuffer(image)) {
              contents.push({
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image.toString('base64'),
                },
              });
            }
          }
        }
      }
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: contents,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: options?.aspectRatio as `${number}:${number}`,
            imageSize: '1K',
          },
          httpOptions: {
            // headers: options?.headers || {},
          },
          abortSignal: options?.abortSignal,
        },
      });
      const images = [];
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          images.push(imageData);
          // fs.writeFileSync('car_photo.png', buffer);
          // console.log('Image saved as car_photo.png');
        }
      }
      console.log(response.usageMetadata);

      return {
        images,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId: modelId,
          headers: undefined,
        },
      };
    };

    return model;
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
}
