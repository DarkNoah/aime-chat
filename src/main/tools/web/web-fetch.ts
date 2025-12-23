import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';
import { ZhipuAIProvider } from '@/main/providers/zhipuai-provider';

export interface WebFetchParams extends BaseToolParams {
  providerId?: string;
}
export class WebFetch extends BaseTool<WebFetchParams> {
  id: string = 'WebFetch';
  description = `- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
`;
  inputSchema = z
    .object({
      url: z.string().url().describe('The URL to fetch content from'),
      prompt: z.string().describe('The prompt to run on the fetched content'),
    })
    .strict();

  configSchema = ToolConfig.WebFetch.configSchema;

  constructor(config?: WebFetchParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { url, prompt } = inputData;
    const config = this.config;
    if (config?.providerId) {
      const provider = await providersManager.get(config?.providerId);
      if (provider.type === ProviderType.ZHIPUAI) {
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
            url: url,
            timeout: 20,
            no_cache: false,
            return_format: 'markdown',
            retain_images: true,
            no_gfm: false,
            keep_img_data_url: true,
            with_images_summary: true,
            with_links_summary: false,
          }),
        };

        const res = await fetch(
          'https://open.bigmodel.cn/api/paas/v4/reader',
          options,
        );
        const data = await res.json();
        if (data.error) {
          return data.error.message;
        }
        return data.reader_result.content;
      }
    }
    return '';
  };
}
