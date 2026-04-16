import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';
import { ZhipuAIProvider } from '@/main/providers/zhipuai-provider';
import { PDFLoader } from '@/main/utils/loaders/pdf-loader';
import { BrowserContext, chromium } from 'playwright';
import { appManager } from '@/main/app';
import { instancesManager } from '@/main/instances';
import { JinaAIProvider } from '@/main/providers/jinaai-provider';
import { Agent } from '@mastra/core/agent';
import { saveFile } from '@/main/utils/file';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
export interface WebFetchParams extends BaseToolParams {
  providerId?: string;
}
export class WebFetch extends BaseTool<WebFetchParams> {
  static readonly toolName = 'WebFetch';

  id: string = 'WebFetch';
  description = `- Fetches content from a specified URL and returns it as markdown
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - If you need to fully read the page content, do NOT provide the prompt parameter — the full markdown content will be returned directly
  - If you only need specific information from the page, provide a prompt describing what to extract — the content will be processed by a small, fast model and a summarized response will be returned
  - This tool is read-only and does not modify any files
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
`;
  inputSchema = z
    .object({
      url: z.string().url().describe('The URL to fetch content from'),
      prompt: z
        .string()
        .optional()
        .describe('The prompt to run on the fetched content'),
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
    const { requestContext, abortSignal } = options ?? {};
    const workspace = requestContext?.get('workspace' as never) as string;
    const providerId = config?.providerId || ProviderType.LOCAL;
    const provider = await providersManager.getProvider(providerId);
    let content = '';
    try {
      if (provider.type === ProviderType.ZHIPUAI || provider.type === "zhipuai-coding-plan") {
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
          signal: abortSignal,
        };

        const res = await fetch(
          'https://open.bigmodel.cn/api/paas/v4/reader',
          options,
        );
        if (abortSignal?.aborted) {
          return 'Task was aborted by the user.';
        }
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error.message);
        }
        content = data.reader_result.content;
      } else if (provider.type === ProviderType.JINA_AI) {
        const jinaaiProvider = (await providersManager.getProvider(
          config?.providerId,
        )) as JinaAIProvider;
        const token = `Bearer ${jinaaiProvider.provider.apiKey}`;

        const options = {
          headers: {
            Authorization: token,
            'X-With-Generated-Alt': 'true'
          },
          signal: abortSignal,
        };
        const res = await fetch(`https://r.jina.ai/${url}`, options);
        if (abortSignal?.aborted) {
          return 'Task was aborted by the user.';
        }
        const data = await res.text();
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${data}`);
        }

        content = data;
      }
      if (!content) {
        throw new Error('Failed to fetch content');
      }
    }
    catch (error) {
      content = await this.fallback(inputData, options);
    }
    if (!content) {
      throw new Error('Failed to fetch content');
    }

    if (prompt) {
      const model = options.requestContext.get('model' as never) as string;
      const appInfo = await appManager.getInfo();
      const fastModel = appInfo.defaultModel?.fastModel;
      const defaultModel = appInfo.defaultModel?.model;
      const languageModel = await providersManager.getLanguageModel(
        fastModel || model || defaultModel,
      );
      const filePath = await saveFile(Buffer.from(content, 'utf-8'), path.join('.aime-chat', 'web-fetch-results', `${nanoid()}.txt`), workspace);
      const summaryAgent = new Agent({
        id: 'web-content-agent',
        name: 'WebContentAgent',
        instructions: `You are an assistant specialized in analyzing and extracting information from web content.

Your task:
- Carefully read the provided web page content
- Follow the user's instructions to extract, summarize, or analyze the content
- Provide accurate, relevant, and well-organized responses
- If the requested information is not found in the content, clearly state that
- Preserve all relevant image information found in the content, including the image description (alt text) and the complete image URL, formatted as: ![description](url)
- Respond in the same language as the user's request`,
        model: languageModel,
      });
      const result = await summaryAgent.generate([
        {
          role: 'user',
          content: `Please analyze the following web page content and respond to my request.

<request>
${prompt}
</request>

<web_content>
${content}
</web_content>`,
        },
      ], {
        abortSignal: options?.abortSignal,
      });
      return `<system-reminder>This web fetch result full text is saved to: ${filePath}</system-reminder>
${result.text}`;
    }
    return content;
  };

  fallback = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { url, prompt } = inputData;
    const { requestContext, abortSignal } = options ?? {};
    const workspace = requestContext?.get('workspace' as never) as string;

    let html: string;
    const { parseHTML } = await import('linkedom');
    let article: Readability.Article;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: abortSignal,
      });

      if (abortSignal?.aborted) {
        return 'Task was aborted by the user.';
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      html = await res.text();
      const { document } = parseHTML(html);
      const reader = new Readability(document as any);
      article = reader.parse();
      if (!article?.content) {
        throw new Error('Readability failed to extract content');
      }
    } catch {
      const instance = await instancesManager.getWebBrowserInstance();
      const page = await instance.browserContext.newPage();
      try {
        await page.goto(url, { timeout: 15000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch { }
      html = await page.content();
      await page.close();
      const { document } = parseHTML(html);
      const reader = new Readability(document as any);
      article = reader.parse();
    }
    if (abortSignal?.aborted) {
      return 'Task was aborted by the user.';
    }

    if (!article?.content) {
      throw new Error('Readability failed to extract content');
    }

    const turndown = new TurndownService({ headingStyle: 'atx' });
    let content = turndown.turndown(article.content);

    if (article.title) {
      content = `# ${article.title}\n\n${content}`;
    }

    if (!content) {
      throw new Error('Failed to fetch content');
    }

    //     if (prompt) {
    //       const model = options.requestContext.get('model' as never) as string;
    //       const appInfo = await appManager.getInfo();
    //       const fastModel = appInfo.defaultModel?.fastModel;
    //       const defaultModel = appInfo.defaultModel?.model;
    //       const languageModel = await providersManager.getLanguageModel(
    //         fastModel || model || defaultModel,
    //       );
    //       const filePath = await saveFile(
    //         Buffer.from(content, 'utf-8'),
    //         path.join('.aime-chat', 'web-fetch-results', `${nanoid()}.txt`),
    //         workspace,
    //       );
    //       const summaryAgent = new Agent({
    //         id: 'web-content-agent',
    //         name: 'WebContentAgent',
    //         instructions: `You are an assistant specialized in analyzing and extracting information from web content.

    // Your task:
    // - Carefully read the provided web page content
    // - Follow the user's instructions to extract, summarize, or analyze the content
    // - Provide accurate, relevant, and well-organized responses
    // - If the requested information is not found in the content, clearly state that
    // - Preserve all relevant image information found in the content, including the image description (alt text) and the complete image URL, formatted as: ![description](url)
    // - Respond in the same language as the user's request`,
    //         model: languageModel,
    //       });
    //       const result = await summaryAgent.generate(
    //         [
    //           {
    //             role: 'user',
    //             content: `Please analyze the following web page content and respond to my request.

    // <request>
    // ${prompt}
    // </request>

    // <web_content>
    // ${content}
    // </web_content>`,
    //           },
    //         ],
    //         {
    //           abortSignal: options?.abortSignal,
    //         },
    //       );
    //       return `<system-reminder>This web fetch result full text is saved to: ${filePath}</system-reminder>
    // ${result.text}`;
    //     }
    return content;
  };
}
