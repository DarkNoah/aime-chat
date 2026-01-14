import { Not, Repository } from 'typeorm';
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
import { LocalProvider } from './local-provider';
import { JinaAIProvider } from './jinaai-provider';
import { BraveSearchProvider } from './brave-search-provider';
import { TavilyProvider } from './tavily-provider';
import { appManager } from '../app';
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
    if (!filter?.tags?.length) {
      return this.repository.find();
    }
    const proviers = await this.repository
      .createQueryBuilder('p')
      .where(
        `EXISTS (
          SELECT 1
          FROM json_each(COALESCE(p.tags, '[]')) AS je
          WHERE je.value IN (:...tags)
        )`,
        { tags: filter.tags },
      )
      .getMany();
    const localProvider = await this.getProvider(ProviderType.LOCAL);
    if (
      localProvider &&
      localProvider.tags.filter((t) => filter.tags.includes(t)).length > 0
    ) {
      proviers.push({
        id: localProvider.id,
        name: localProvider.name,
        type: localProvider.type,
        models: [],
        tags: localProvider.tags,
        isActive: true,
      });
    }
    return proviers;
  }

  @channel(ProviderChannel.GetAvailableModels)
  public async getAvailableModels(
    type: ModelType = ModelType.LLM,
  ): Promise<Provider[]> {
    // const data = await this.repository.find({
    //   where: {
    //     isActive: true,
    //   },
    // });
    // const filteredData = data.filter(
    //   (x) =>
    //     x.models &&
    //     x.models.length > 0 &&
    //     x.models.filter((m) => m.isActive === true).length > 0,
    // );

    // const output: Provider[] = [];
    // for (const providerData of filteredData) {
    //   // const provider = await this.getProvider(providerData.id);
    //   output.push({
    //     id: providerData.id,
    //     name: providerData.name,
    //     icon: providerData.icon,
    //     type: providerData.type as ProviderType,
    //     models: providerData.models
    //       .filter((m) => m.isActive === true)
    //       .map((y) => {
    //         return {
    //           id: `${providerData.id}/${y.id}`,
    //           name: y.name || y.id,
    //           providerType: providerData.type,
    //         };
    //       })
    //       .sort((a, b) => b.name.localeCompare(a.name)),
    //   });
    // }

    if (type == ModelType.LLM) {
      return this.getAvailableLanguageModels();
    } else if (type == ModelType.EMBEDDING) {
      return this.getAvailableEmbeddingModels();
    } else if (type == ModelType.RERANKER) {
      return this.getAvailableRerankModels();
    } else if (type == ModelType.IMAGE_GENERATION) {
      return this.getAvailableImageGenerationModels();
    }
  }

  @channel(ProviderChannel.Create)
  public async create(data: CreateProvider): Promise<Provider> {
    if (await this.repository.findOne({ where: { name: data.name.trim() } })) {
      throw new Error('Provider already exists');
    }
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
      tags: [],
    });
    await this.repository.save(provider);
    const providerData = await this.getProvider(provider.id);
    if (providerData && providerData.tags && providerData.tags.length > 0) {
      await this.repository.update(provider.id, { tags: providerData.tags });
    }
    return provider;
  }

  @channel(ProviderChannel.Delete)
  public async deleteProviders(id: string): Promise<void> {
    await this.repository.delete(id);
  }
  @channel(ProviderChannel.Update)
  public async updateProviders(id: string, data: any): Promise<void> {
    // const providerData = await this.repository.findOne({ where: { id } });
    const provider = await this.getProvider(id);
    if (
      data?.name?.trim() &&
      (await this.repository.findOne({
        where: { name: data.name?.trim(), id: Not(id) },
      }))
    ) {
      throw new Error('Provider already exists');
    }
    if (provider && provider.tags && provider.tags.length > 0) {
      data['tags'] = provider.tags;
    }
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
          isCustom: x.isCustom ?? false,
        };
      }),
    });
  }

  @channel(ProviderChannel.GetModelList)
  public async getModels(id: string): Promise<any> {
    const providerData = await this.repository.findOne({ where: { id } });
    const savedModels: Array<{
      id: string;
      name: string;
      isActive: boolean;
      isCustom?: boolean;
    }> = providerData?.models ?? [];

    // 获取自定义模型
    const customModels = savedModels
      .filter((m) => m.isCustom)
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        isActive: m.isActive,
        isCustom: true,
      }));

    const provider = await this.getProvider(id);
    if (!provider) {
      const models = Object.values(
        modelsData[providerData.type]?.models ?? {},
      ) as ProviderModel[];
      const providerModels = models.map((x) => {
        return {
          isActive: savedModels.find((z) => z.id === x.id)?.isActive || false,
          ...x,
        };
      });
      return [...customModels, ...providerModels];
    }
    let providerModels = [];

    try {
      const models = await provider.getLanguageModelList();

      providerModels = models.map((x) => {
        const info = modelsData[provider.type]?.models[x.id] || {};
        return {
          id: x.id,
          isActive: savedModels.find((z) => z.id === x.id)?.isActive || false,
          ...info,
          name: info?.name || x.name || x.id,
        } as ProviderModel;
      });
    } catch (err) {
      appManager.toast(err.message, { type: 'error' });
    }

    return [...customModels, ...providerModels];
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

  public async getAvailableRerankModels(): Promise<Provider[]> {
    const providers = await this.repository.find({
      where: {
        isActive: true,
      },
    });
    const data: Provider[] = [];
    const localProvider = new LocalProvider();
    const models = await localProvider.getRerankModelList();
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
          const rerankModels = await provider.getRerankModelList();
          if (rerankModels.length > 0) {
            data.push({
              id: providerData.id,
              name: providerData.name,
              type: providerData.type,
              models: rerankModels
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

  public async getAvailableImageGenerationModels(): Promise<Provider[]> {
    const providers = await this.repository.find({
      where: {
        isActive: true,
      },
    });
    const data: Provider[] = [];

    for (const providerData of providers) {
      const provider = await this.getProvider(providerData.id);

      if (provider) {
        try {
          const imageGenerationModels = await provider.getImageGenerationList();
          if (imageGenerationModels.length > 0) {
            data.push({
              id: providerData.id,
              name: providerData.name,
              type: providerData.type,
              models: imageGenerationModels
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
      case ProviderType.JINA_AI:
        return new JinaAIProvider(provider);
      case ProviderType.BRAVE_SEARCH:
        return new BraveSearchProvider(provider);
      case ProviderType.TAVILY:
        return new TavilyProvider(provider);
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
