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
import { PDFLoader } from '@/main/utils/loaders/pdf-loader';
import { BrowserContext, chromium } from 'playwright';
import { appManager } from '@/main/app';
import { instancesManager } from '@/main/instances';
import { JinaAIProvider } from '@/main/providers/jinaai-provider';
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
    const providerId = config?.providerId || ProviderType.LOCAL;
    const provider = await providersManager.getProvider(providerId);
    if (provider.type === ProviderType.LOCAL) {
      // const userDataDir = path.join(
      //   app.getPath('userData'),
      //   'instances',
      //   'default_browser',
      // );
      // const httpProxy = await appManager.getProxy();
      // const browserContext = await chromium.launchPersistentContext(
      //   userDataDir,
      //   {
      //     headless: false,
      //     proxy: httpProxy
      //       ? {
      //           server: `${httpProxy}`,
      //         }
      //       : undefined,
      //     args: [
      //       '--disable-blink-features=AutomationControlled',
      //       '--enable-webgl',
      //     ],
      //     // channel: 'msedge',
      //     // executablePath: this.instances?.config?.executablePath,
      //   },
      // );
      const instance = await instancesManager.getWebBrowserInstance();
      const page = await instance.browserContext.newPage();
      try {
        await page.goto(url, { timeout: 5000 });
        await page.waitForLoadState('networkidle');
      } catch {}

      //await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
      // html = await page.content();
      // const pdfDir = path.join(app.getPath('temp'), 'tmp');
      // if (!fs.existsSync(pdfDir)) {
      //   fs.mkdirSync(pdfDir, { recursive: true });
      // }

      // const pdfPath = path.join(getDataPath(), 'tmp', `${uuidv4()}.pdf`);
      //创建文件夹

      await page.emulateMedia({ media: 'screen' });

      const pdfBuffer = await page.pdf({
        displayHeaderFooter: false,
        printBackground: false,
      });

      //const pdfPath = `./${Date.now()}.pdf`;
      //fs.writeFileSync(pdfPath, pdfBuffer);

      // 将Buffer转换为Blob对象
      const blob = new Blob([Buffer.from(pdfBuffer)], {
        type: 'application/pdf',
      });
      const loader = new PDFLoader(blob, {
        pageJoiner: '\n',
      });
      const docs = await loader.load();
      // await page.pdf({
      //   path: pdfPath,
      //   printBackground: false,
      // });

      const html = await page.content();
      await page.close();
      return docs;
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
    } else if (provider.type === ProviderType.JINA_AI) {
      const jinaaiProvider = (await providersManager.getProvider(
        config?.providerId,
      )) as JinaAIProvider;
      const token = `Bearer ${jinaaiProvider.provider.apiKey}`;

      const options = {
        headers: {
          Authorization: token,
        },
      };
      const res = await fetch(`https://r.jina.ai/${url}`, options);
      const data = await res.text();
      return data;
    }
    return '';
  };
}
