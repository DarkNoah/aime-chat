import { Alibaba3DModel, ALIBABA_3D_MODELS } from './alibaba-3d-model';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Providers } from '@/entities/providers';
import { ALIBABA_DNS_LABEL, DEFAULT_ALIBABA_REGION } from '@/types/alibaba';
import { ProviderTag } from '@/types/provider';
import modelsData from '../../../assets/models.json';
import { BaseProvider } from './base-provider';
import { WanVideoModel } from './wan-video-model';
import {
  AlibabaSpeechModel,
  ALIBABA_SPEECH_MODELS,
} from './alibaba-speech-model';
import {
  AlibabaTranscriptionModel,
  ALIBABA_TRANSCRIPTION_MODELS,
} from './alibaba-transcription-model';

/** Retains Alibaba's chat API and uses workspace endpoints for media models. */
export class AlibabaProvider extends BaseProvider {
  name = 'Alibaba';

  type: string;

  description = 'Alibaba Cloud Model Studio';

  defaultApiBase: string;

  tags = [ProviderTag.VIDEO_GENERATION];

  constructor(provider: Providers) {
    super({ provider });
    this.type = provider.type;
    this.defaultApiBase =
      modelsData[this.type]?.api || modelsData['alibaba-cn'].api;
  }

  languageModel(modelId: string) {
    return createOpenAICompatible({
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
      name: this.provider.name || this.name,
      includeUsage: true,
    }).languageModel(modelId);
  }

  async getLanguageModelList(): Promise<{ id: string; name: string }[]> {
    return Object.values(
      modelsData[this.type]?.models ?? modelsData['alibaba-cn'].models,
    );
  }

  // Required provider interface; this capability has no instance-specific state.
  // eslint-disable-next-line class-methods-use-this
  async getEmbeddingModelList() {
    return [];
  }

  // Required provider interface; this capability has no instance-specific state.
  // eslint-disable-next-line class-methods-use-this
  async getRerankModelList() {
    return [];
  }

  // Required provider interface; this capability has no instance-specific state.
  // eslint-disable-next-line class-methods-use-this
  async getImageGenerationList() {
    return [];
  }

  // Required provider interface; this capability has no instance-specific state.
  // eslint-disable-next-line class-methods-use-this
  async getCredits() {
    return undefined;
  }

  // Required provider interface; this capability has no instance-specific state.
  // eslint-disable-next-line class-methods-use-this
  async getVideoModelList() {
    return [
      { id: 'wan3.0-video', name: 'Wan 3.0 Video' },
      { id: 'wan3.0-video-prime', name: 'Wan 3.0 Video Prime' },
    ];
  }

  private getNativeApiBase() {
    const workspaceId = this.provider.config?.workspaceId?.trim();
    const region =
      this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION;
    if (!workspaceId || !ALIBABA_DNS_LABEL.test(workspaceId))
      throw new Error('Set a valid Alibaba workspaceId in provider settings.');
    if (!ALIBABA_DNS_LABEL.test(region))
      throw new Error(
        'Invalid Alibaba region; enter a region identifier such as cn-beijing.',
      );
    return `https://${workspaceId}.${region}.maas.aliyuncs.com/api/v1`;
  }

  async getTranscriptionModelList() {
    const region =
      this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION;
    return ALIBABA_TRANSCRIPTION_MODELS.filter((model) =>
      model.regions.includes(region),
    ).map(({ id, name }) => ({ id, name }));
  }

  async getSpeechModelList() {
    const region =
      this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION;
    return ALIBABA_SPEECH_MODELS.filter((model) =>
      model.regions.includes(region),
    ).map(({ id, name }) => ({ id, name }));
  }

  speechModel(modelId: string) {
    return new AlibabaSpeechModel({
      modelId,
      apiKey: this.provider.apiKey,
      apiBase: this.getNativeApiBase(),
      region: this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION,
    });
  }

  transcriptionModel(modelId: string) {
    return new AlibabaTranscriptionModel({
      modelId,
      apiKey: this.provider.apiKey,
      apiBase: this.getNativeApiBase(),
      region: this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION,
    });
  }

  async get3DModelList() {
    const region =
      this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION;
    return region === 'cn-beijing'
      ? ALIBABA_3D_MODELS.map((model) => ({ ...model }))
      : [];
  }

  model3d(modelId: string) {
    return new Alibaba3DModel({
      modelId,
      apiKey: this.provider.apiKey,
      apiBase: this.getNativeApiBase(),
      region: this.provider.config?.region?.trim() || DEFAULT_ALIBABA_REGION,
    });
  }

  videoModel(modelId: string) {
    return new WanVideoModel({
      modelId,
      apiKey: this.provider.apiKey,
      apiBase: this.getNativeApiBase(),
    });
  }
}
