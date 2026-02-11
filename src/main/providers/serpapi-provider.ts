import { Providers } from '@/entities/providers';
import { BaseProvider } from './base-provider';
import fs from 'fs';
import path from 'path';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';

export class SerpapiProvider extends BaseProvider {
  name: string = 'serpapi';
  type: ProviderType = ProviderType.SERPAPI;
  tags: ProviderTag[] = [ProviderTag.WEB_SEARCH];
  description: string;
  defaultApiBase?: string;
  hasChatModel?: boolean = false;

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
    return [];
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
    return undefined;
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
}
