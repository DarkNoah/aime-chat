import { Providers } from '@/entities/providers';
import { ProviderTag, ProviderType } from '@/types/provider';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAICompatibleConfig } from '@mastra/core/llm';
import { OpenAIProvider } from './openai-provider';
import { OpenAIRerankModel, RerankModel } from './base-provider';

/**
 * OpenAI 兼容供应商(Responses API)。
 *
 * 与 OpenAIProvider 的区别:语言模型直接走新版 /responses 接口,
 * 而不是 Chat Completions。注意不能返回带 url 的 OpenAICompatibleConfig,
 * 因为 Mastra 的模型路由对带 url 的配置固定使用 Chat Completions。
 */
export class OpenAIResponsesProvider extends OpenAIProvider {
  name: string = 'openai-responses';
  type: ProviderType = ProviderType.OPENAI_RESPONSES;

  tags: ProviderTag[] = [];

  constructor(provider: Providers) {
    super(provider);
  }

  languageModel(modelId: string): LanguageModelV2 | OpenAICompatibleConfig {
    return createOpenAI({
      name: 'openai',
      baseURL: this.provider.apiBase || this.defaultApiBase,
      apiKey: this.provider.apiKey,
    }).responses(modelId);
  }

  rerankModel(modelId: string): RerankModel {
    return new OpenAIRerankModel(this.name, { modelId, provider: this.provider });
  }

}
