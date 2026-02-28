import { Providers } from '@/entities/providers';
import { BaseProvider, MusicModel } from './base-provider';
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
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export class ElevenlabsMusicModel implements MusicModel {
  provider: string = 'elevenlabs';
  modelId: string;
  defaultApiBase?: string = 'https://api.elevenlabs.io/v1';
  providerEntity: Providers;

  constructor({ modelId, provider }: { modelId: string, provider: Providers }) {
    this.modelId = modelId;
    this.providerEntity = provider;
  }
  doGenerate = async (options: { prompt: string; }): Promise<string> => {
    const body = {
      model_id: this.modelId,
      prompt: options.prompt,
    };
    const client = new ElevenLabsClient({
      baseUrl: this.providerEntity.apiBase || this.defaultApiBase,
      apiKey: this.providerEntity.apiKey
    });
    const data = await client.music.compose(body);


    return data;
  }
}



export class ElevenlabsProvider extends BaseProvider {
  name: string = 'elevenlabs';
  type: ProviderType = ProviderType.ELEVENLABS;
  tags: ProviderTag[] = [];
  description: string;
  defaultApiBase?: string = 'https://api.elevenlabs.io/v1';
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
  async getMusicModelList(): Promise<{ name: string; id: string }[]> {
    return [{ id: 'music_v1', name: 'Music V1' }];
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
  musicModel?(modelId: string): MusicModel {
    return new ElevenlabsMusicModel({ modelId, provider: this.provider });
  }
}
