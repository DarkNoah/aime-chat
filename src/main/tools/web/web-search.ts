import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';
import { GoogleProvider } from '@/main/providers/google-provider';
import { OpenAIProvider } from '@/main/providers/openai-provider';
import { ZhipuAIProvider } from '@/main/providers/zhipuai-provider';
import { tavily } from '@tavily/core';
import { getJson } from 'serpapi';
export interface WebSearchParams extends BaseToolParams {
  providerId?: string;
  numResults?: number;
}

export const webSearchResultSchema = z.array(
  z.object({
    href: z.string().optional(),
    title: z.string().optional(),
    snippet: z.string().optional(),
  }),
);
export class WebSearch extends BaseTool<WebSearchParams> {
  static readonly toolName = 'WebSearch';
  id: string = 'WebSearch';
  description = `- Allows to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks
- Use this tool for accessing information beyond ai model knowledge cutoff
- Searches are performed automatically within a single API call

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US
  - Account for "Today's date" in <env>. For example, if <env> says "Today's date: 2025-07-01", and the user wants the latest docs, do not use 2024 in the search query. Use 2025.

Returns:
  List of search results with the following fields:
    - href: The URL of the search result
    - title: The title of the search result
    - snippet: The snippet of the search result
  `;
  inputSchema = z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
  });

  outputSchema = webSearchResultSchema;

  configSchema = ToolConfig.WebSearch.configSchema;

  constructor(config?: WebSearchParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { query } = inputData;
    const config = this.config;
    const numResults = config?.numResults ?? 20;
    const results: z.infer<typeof webSearchResultSchema> = [];
    if (config?.providerId) {
      const provider = await providersManager.get(config?.providerId);
      if (provider.type === ProviderType.BRAVE_SEARCH) {
        const webSearchResults = await braveSearch({
          query,
          numResults,
          apiKey: provider.apiKey,
        });
        results.push(...webSearchResults);
      } else if (provider.type === ProviderType.GOOGLE) {
        const googleProvider = (await providersManager.getProvider(
          config?.providerId,
        )) as GoogleProvider;
        const googleSearch = googleProvider.google.tools.googleSearch({});
        const res = await googleSearch.execute(
          { webSearchQueries: [query] },
          {
            abortSignal: options?.abortSignal,
            toolCallId: options?.agent?.toolCallId,
          },
        );
        debugger;
        results.push(...webSearchResults);
      } else if (provider.type === ProviderType.OPENAI) {
        const openaiProvider = (await providersManager.getProvider(
          config?.providerId,
        )) as OpenAIProvider;
        const response = await openaiProvider.openaiClient.responses.create({
          model: 'gpt-5',
          tools: [{ type: 'web_search' }],
          input: query,
          include: ['web_search_call.action.sources'],
        });

        debugger;
      } else if (provider.type === ProviderType.ZHIPUAI) {
        const zhipuaiProvider = (await providersManager.getProvider(
          config?.providerId,
        )) as ZhipuAIProvider;
        const options = {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${zhipuaiProvider.provider.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            search_query: query,
            search_engine: 'search_std',
            search_intent: false,
            count: numResults,
            // search_domain_filter: '<string>',
            search_recency_filter: 'noLimit',
            content_size: 'medium',
            // request_id: '<string>',
            // user_id: '<string>',
          }),
        };

        const res = await fetch(
          'https://open.bigmodel.cn/api/paas/v4/web_search',
          options,
        );
        const data = await res.json();
        results.push(
          ...data.search_result.map((x) => {
            return {
              href: x.link || undefined,
              title: x.title,
              snippet: x.content,
            };
          }),
        );
      } else if (provider.type === ProviderType.TAVILY) {
        const proxy = await appManager.getProxy();
        const client = tavily({
          apiKey: provider.apiKey,
          proxies: {
            http: 'http://' + proxy,
            https: 'http://' + proxy,
          },

          // apiBaseURL: 'https://api.tavily.com',
        });
        const response = await client.search(query, {
          maxResults: numResults,
        });
        debugger;
      } else if (provider.type === ProviderType.JINA_AI) {
        const proxy = await appManager.getProxy();
        const url = 'https://s.jina.ai/?q=' + encodeURIComponent(query);
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${provider.apiKey}`,
            'X-Respond-With': 'no-content',
          },

          signal: options?.abortSignal,
        });
        const data = await response.json();

        results.push(
          ...data.data.map((x) => {
            return {
              title: x.title,
              href: x.url,
              snippet: x.description,
            };
          }),
        );
      } else if (provider.type === ProviderType.SERPAPI) {
        const response = await getJson({
          engine: 'google',
          api_key: provider.apiKey, // Get your API_KEY from https://serpapi.com/manage-api-key
          q: query,

          // location: 'Austin, Texas',
        });
        results.push(
          ...response.organic_results.map((x) => {
            return {
              title: x.title,
              href: x.link,
              snippet: x.snippet,
            };
          }),
        );
      }
    } else {
      throw new Error('Provider not found');
    }
    return results;
  };
}

const braveSearch = async (options: {
  query: string;
  numResults?: number;
  apiKey: string;
}): Promise<z.infer<typeof webSearchResultSchema>> => {
  const results: z.infer<typeof webSearchResultSchema> = [];
  const headers = {
    'X-Subscription-Token': options.apiKey,
    Accept: 'application/json',
  };
  const searchUrl = new URL(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(options.query)}&count=${options.numResults ?? 20}`,
  );
  const response = await fetch(searchUrl, {
    headers,
    //agent: proxy ? new HttpsProxyAgent(proxy) : false,
  });
  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }
  const parsedResponse = await response.json();
  if (!response.ok) {
    throw new Error(
      `Request failed with status code ${response.status}: ${parsedResponse.error || parsedResponse.detail}`,
    );
  }
  const webSearchResults = parsedResponse.web?.results ?? [];

  results.push(
    ...webSearchResults.map((item) => ({
      href: item.url,
      title: item.title,
      snippet: item.description,
    })),
  );
  return results;
};
