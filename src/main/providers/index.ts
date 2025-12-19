import { In, Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { Providers } from '@/entities/providers';
import { dialog, ipcMain } from 'electron';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import {
  CreateProvider,
  ModelType,
  Provider,
  ProviderModel,
  ProviderTag,
  ProviderType,
} from '@/types/provider';
import { v4 as uuidv4 } from 'uuid';
import { ProviderChannel } from '@/types/ipc-channel';
import { createGateway, EmbeddingModel, gateway, LanguageModel } from 'ai';
import { DynamicArgument } from '@mastra/core/types';
import { MastraModelConfig } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Ollama } from 'ollama';
import { LmstudioProvider } from './lmstudio-provider';
import { BaseProvider } from './base-provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { OpenAIProvider } from './openai-provider';
import { DeepSeekProvider } from './deepseek-provider';
import { ZhipuAIProvider } from './zhipuai-provider';
import { GoogleProvider } from './google-provider';
import { ModelScopeProvider } from './modelscope-provider';
import { OllamaProvider } from './ollama-provider';
import fs from 'fs';
import path from 'path';
import { LocalProvider, localProvider } from './local-provider';
const modelsData = require('../../../assets/models.json');
class ProvidersManager extends BaseManager {
  repository: Repository<Providers>;

  connectionsStore: Providers[] | undefined;

  constructor() {
    super();
  }

  public async init() {
    this.repository = dbManager.dataSource.getRepository(Providers);
    return;
  }

  @channel(ProviderChannel.Get)
  public async get(id: string): Promise<Provider> {
    const provider = await this.repository.findOne({ where: { id } });
    return provider;
  }

  @channel(ProviderChannel.GetList)
  public async getList(filter?: { tags?: ProviderTag[] }): Promise<Provider[]> {
    const providers = await this.repository.find({
      where: {
        tags: filter?.tags ? In(filter.tags) : undefined,
      },
    });
    return providers;
  }

  @channel(ProviderChannel.GetAvailableModels)
  public async getAvailableModels(
    type: ModelType = ModelType.LLM,
  ): Promise<Provider[]> {
    if (type == ModelType.LLM) {
      return this.getAvailableLanguageModels();
    }
    if (type == ModelType.EMBEDDING) {
      return this.getAvailableEmbeddingModels();
    }
  }

  @channel(ProviderChannel.Create)
  public async create(data: CreateProvider): Promise<Provider> {
    const provider = this.repository.create({
      id: uuidv4(),
      name: data.name,
      icon: data.icon,
      type: data.type,
      apiBase: data.apiBase,
      apiKey: data.apiKey,
      isActive: data.isActive,
      models: [],
      config: data.config,
    });
    await this.repository.save(provider);
    return provider;
  }

  @channel(ProviderChannel.Delete)
  public async deleteProviders(id: string): Promise<void> {
    await this.repository.delete(id);
  }
  @channel(ProviderChannel.Update)
  public async updateProviders(id: string, data: any): Promise<void> {
    await this.repository.update(id, data);
  }

  @channel(ProviderChannel.UpdateModels)
  public async updateModels(id: string, data: ProviderModel[]): Promise<void> {
    await this.repository.update(id, {
      models: data.map((x) => {
        return {
          id: x.id,
          name: x.name,
          isActive: x.isActive,
        };
      }),
    });
  }

  @channel(ProviderChannel.GetModelList)
  public async getModels(id: string): Promise<any> {
    const providerData = await this.repository.findOne({ where: { id } });
    const savedModels: Array<{ id: string; name: string; isActive: boolean }> =
      providerData?.models ?? [];
    const provider = await this.getProvider(id);
    if (!provider) {
      const models = Object.values(modelsData[providerData.type]?.models ?? {});
      return models.map((x) => {
        return {
          isActive: savedModels.find((z) => z.id === x.id)?.isActive || false,
          ...x,
        };
      });
    }

    const models = await provider.getLanguageModelList();

    return models.map((x) => {
      const info = modelsData[provider.type]?.models[x.id] || {};
      return {
        id: x.id,

        isActive: savedModels.find((z) => z.id === x.id)?.isActive || false,
        ...info,
        name: info?.name || x.name || x.id,
      } as ProviderModel;
    });
    // if (provider.type === ProviderType.OPENAI) {
    //   const openai = new OpenAI({
    //     apiKey: provider.apiKey,
    //     baseURL: provider.apiBase || undefined,
    //   });
    //   const list = await openai.models.list();
    //   const items = (list?.data ?? []).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // } else if (provider?.type == ProviderType.DEEPSEEK) {
    //   const options = {
    //     method: 'GET',
    //     headers: {
    //       accept: 'application/json',
    //       'content-type': 'application/json',
    //       Authorization: `Bearer ${provider.apiKey}`,
    //     },
    //   };

    //   const url = 'https://api.deepseek.com/models';
    //   const res = await fetch(url, options);
    //   const models = await res.json();
    //   const items = (models?.data ?? []).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // } else if (provider?.type == ProviderType.GOOGLE) {
    //   const ai = new GoogleGenAI({ apiKey: provider.apiKey });
    //   const res = await ai.models.list({
    //     config: {
    //       pageSize: 100,
    //     },
    //   });
    //   return res.page
    //     .filter((x: any) => x.supportedActions.includes('generateContent'))
    //     .map((x: any) => {
    //       const id = x.name.split('/')[1];
    //       const model = savedModels.find((z) => z.id === id);
    //       return {
    //         id: id,
    //         name: model?.name || x.displayName,
    //         isActive: model?.isActive || false,
    //       } as ProviderModel;
    //     })
    //     .sort((a: ProviderModel, b: ProviderModel) =>
    //       a.name.localeCompare(b.name),
    //     );
    // } else if (provider?.type == ProviderType.GATEWAY) {
    //   const availableModels = await gateway.getAvailableModels();
    //   return availableModels.models
    //     .filter((x: any) => x.modelType == 'language')
    //     .map((x: any) => {
    //       const model = savedModels.find((z) => z.id === x.id);
    //       return {
    //         id: x.id,
    //         name: model?.name || x.name,
    //         isActive: model?.isActive || false,
    //       } as ProviderModel;
    //     })
    //     .sort((a: ProviderModel, b: ProviderModel) =>
    //       a.name.localeCompare(b.name),
    //     );
    // } else if (provider?.type == ProviderType.MODELSCOPE) {
    //   const openai = new OpenAI({
    //     apiKey: provider.apiKey,
    //     baseURL: provider.apiBase || 'https://api-inference.modelscope.cn/v1',
    //   });
    //   const list = await openai.models.list();
    //   const items = (list?.data ?? []).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // } else if (provider?.type == ProviderType.ZHIPUAI) {
    //   const models = [
    //     {
    //       id: 'glm-4.6',
    //       name: 'GLM-4.6',
    //     },
    //   ];
    //   const items = (models ?? []).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // } else if (provider?.type == ProviderType.OLLAMA) {
    //   const ollama = new Ollama({
    //     host: provider.apiBase,
    //   });
    //   const list = await ollama.list();
    //   const models = list.models
    //     .map((x) => {
    //       return {
    //         id: x.model,
    //         name: x.name,
    //       };
    //     })
    //     .sort((a, b) => a.name.localeCompare(b.name));
    //   const items = (models ?? []).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // } else if (provider?.type == ProviderType.LMSTUDIO) {
    //   const openai = new OpenAI({
    //     apiKey: provider.apiKey,
    //     baseURL: provider.apiBase || 'http://127.0.0.1:1234/v1',
    //   });
    //   const list = await openai.models.list();
    //   const items = (
    //     list?.data.filter((x) => !x.id.startsWith('text-embedding-')) ?? []
    //   ).map((x: any) => {
    //     const model = savedModels.find((z) => z.id === x.id || z.name === x.id);
    //     return {
    //       id: x.id,
    //       name: model?.name || x.id,
    //       isActive: model?.isActive || false,
    //     } as ProviderModel;
    //   });
    //   return items.sort((a: ProviderModel, b: ProviderModel) =>
    //     a.name.localeCompare(b.name),
    //   );
    // }
    // return provider?.models;
  }

  public async getLanguageModel(
    modelId: string,
  ): Promise<LanguageModel | DynamicArgument<MastraModelConfig> | undefined> {
    const providerId = modelId.split('/')[0];
    const providerData = await this.repository.findOne({
      where: { id: providerId },
    });
    const _modeId = modelId.substring(providerId.length + 1);

    const provider = await this.getProvider(providerId);
    if (!provider) {
      const baseURL = providerData.apiBase || modelsData[providerData.type].api;
      return createOpenAICompatible({
        baseURL: baseURL,
        apiKey: providerData.apiKey,
        name: providerData.name || modelsData[providerData.type].name,
        includeUsage: true,
      }).languageModel(_modeId);
    }

    const model = provider.languageModel(_modeId);
    return model;
  }

  public async getEmbeddingModel(
    modelId: string,
  ): Promise<EmbeddingModelV2<string> | undefined> {
    const providerId = modelId.split('/')[0];
    const provider = await this.getProvider(providerId);
    if (!provider) {
      return;
    }
    const _modeId = modelId.substring(providerId.length + 1);
    return provider.textEmbeddingModel(_modeId);
  }

  public async getAvailableLanguageModels(): Promise<Provider[]> {
    const data = await this.repository.find({
      where: {
        isActive: true,
      },
    });
    const filteredData = data.filter(
      (x) =>
        x.models &&
        x.models.length > 0 &&
        x.models.filter((m) => m.isActive === true).length > 0,
    );

    const output: Provider[] = [];
    for (const providerData of filteredData) {
      const provider = await this.getProvider(providerData.id);
      output.push({
        id: providerData.id,
        name: providerData.name,
        icon: providerData.icon,
        type: providerData.type as ProviderType,
        models: providerData.models
          .filter((m) => m.isActive === true)
          .map((y) => {
            return {
              id: `${providerData.id}/${y.id}`,
              name: y.name || y.id,
              providerType: providerData.type,
            };
          })
          .sort((a, b) => b.name.localeCompare(a.name)),
      });
    }

    return output;
  }

  public async getAvailableEmbeddingModels(): Promise<Provider[]> {
    const providers = await this.repository.find({
      where: {
        isActive: true,
      },
    });
    const data: Provider[] = [];
    const localProvider = new LocalProvider();
    const models = await localProvider.getEmbeddingModelList();
    if (models.length > 0) {
      data.push({
        id: localProvider.id,
        name: localProvider.name,
        type: ProviderType.LOCAL,
        models: models.map((x) => ({
          id: `${localProvider.id}/${x.id}`,
          name: x.name,
          providerType: ProviderType.LOCAL,
          isActive: true,
        })),
      });
    }

    for (const providerData of providers) {
      const provider = await this.getProvider(providerData.id);
      if (provider) {
        try {
          const embeddingModels = await provider.getEmbeddingModelList();
          if (embeddingModels.length > 0) {
            data.push({
              id: providerData.id,
              name: providerData.name,
              type: providerData.type,
              models: embeddingModels
                .map((x) => ({
                  id: `${providerData.id}/${x.id}`,
                  name: x.name,
                  providerType: providerData.type,
                  isActive: true,
                }))
                .sort((a, b) => b.name.localeCompare(a.name)),
            });
          }
        } catch {}
      }
    }

    return data;
  }

  public async getProvider(id: string): Promise<BaseProvider | undefined> {
    const provider = await this.repository.findOneBy({ id });
    if (!provider) {
      if (id === ProviderType.LOCAL) {
        return new LocalProvider();
      }
      return;
    }
    switch (provider.type) {
      case ProviderType.LMSTUDIO:
        return new LmstudioProvider(provider);
      case ProviderType.OPENAI:
        return new OpenAIProvider(provider);
      case ProviderType.DEEPSEEK:
        return new DeepSeekProvider(provider);
      case ProviderType.ZHIPUAI:
        return new ZhipuAIProvider(provider);
      case ProviderType.GOOGLE:
        return new GoogleProvider(provider);
      case ProviderType.MODELSCOPE:
        return new ModelScopeProvider(provider);
      case ProviderType.OLLAMA:
        return new OllamaProvider(provider);
    }
  }

  public async getModelInfo(_modelId: string) {
    const providerId = _modelId.split('/')[0];

    const provider = await providersManager.get(_modelId.split('/')[0]);
    if (!provider) {
      throw new Error('Provider not found');
    }
    const modelId = _modelId.substring(_modelId.split('/')[0].length + 1);
    const modelInfo = modelsData[provider.type]?.models[modelId];
    return {
      providerId,
      modelId,
      modelInfo,
      providerType: provider.type,
    };
  }
}
export const providersManager = new ProvidersManager();
