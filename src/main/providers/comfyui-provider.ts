import { ProviderCredits, ProviderTag, ProviderType } from "@/types/provider";
import { BaseProvider, MusicModel, VideoModel } from "./base-provider";
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';

export class ComfyUIProvider extends BaseProvider {
  name: string = 'comfyui';
  type: ProviderType = ProviderType.COMFYUI;
  tags: ProviderTag[] = [ProviderTag.IMAGE_GENERATION, ProviderTag.VIDEO_GENERATION];
  description: string;
  defaultApiBase?: string = 'http://localhost:8188';
  hasChatModel?: boolean = false;

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
    return [];
  }
  async getVideoModelList(): Promise<{ name: string; id: string }[]> {
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
  musicModel?(modelId: string): MusicModel {
    return undefined;
  }
  videoModel?(modelId: string): VideoModel {
    return undefined;
  }
}
