import { Instances } from '@/entities/instances';
import { BaseInstance, BaseInstanceParams } from './base-instance';
import path from 'path';
import { BrowserContext, chromium } from 'playwright';
import { EventEmitter } from 'events';
import fs from 'fs';
import { AISdkClient, Stagehand } from '@browserbasehq/stagehand';
import { appManager } from '../app';
import { providersManager } from '../providers';
import { getDataPath } from '../utils';

export class BrowserInstance extends BaseInstance {
  browser_context?: BrowserContext;

  stagehand?: Stagehand;

  runWithLLM: boolean = false;

  private eventEmitter = new EventEmitter();

  constructor(params?: BaseInstanceParams) {
    super(params ?? { instances: undefined });
  }

  run = async (modelProvider?: string) => {
    const httpProxy = await appManager.getProxy();

    if (modelProvider) {
      if (this.stagehand) {
        await this.stop();
      }

      const provider = await providersManager.getProvider(modelProvider);

      const llmClient = new AISdkClient({
        model: provider.languageModel(modelProvider),
      });

      const stagehand = new Stagehand({
        env: 'LOCAL',
        model: {
          modelName: llmClient.modelName,
        },
        // modelName: modelName as any,
        // modelClientOptions: {
        //   apiKey: provider.provider.api_key,
        //   baseURL: provider.provider.api_base,
        // },
        llmClient,
        localBrowserLaunchOptions: {
          userDataDir: this.instances?.config?.userDataPath,
          proxy: httpProxy
            ? {
                server: `${httpProxy}`,
              }
            : undefined,
          executablePath: this.instances?.config?.executablePath,
          headless: false,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--enable-webgl',
          ],
        },
      });

      await stagehand.init();

      this.stagehand = stagehand;
      this.runWithLLM = true;
      return;
    } else {
      if (
        this.instances?.config?.userDataPath ||
        this.instances?.config?.executablePath
      ) {
        const userDataDir = path.join(getDataPath(), 'User Data');
        this.browser_context = await chromium.launchPersistentContext(
          this.instances?.config?.userDataPath || userDataDir,
          {
            headless: false,
            proxy: httpProxy
              ? {
                  server: `${httpProxy}`,
                }
              : undefined,
            args: [
              '--disable-blink-features=AutomationControlled',
              '--enable-webgl',
            ],
            // channel: 'msedge',
            executablePath: this.instances?.config?.executablePath,
          },
        );
      } else if (this.instances?.config?.cdpUrl) {
        this.browser_context = await (
          await chromium.connectOverCDP(this.instances?.config?.cdpUrl)
        ).newContext();
      } else if (this.instances?.config?.wssUrl) {
        this.browser_context = await (
          await chromium.connect(this.instances?.config?.wssUrl)
        ).newContext();
      } else {
        const browser = await chromium.launch({
          headless: false,
          proxy: httpProxy
            ? {
                server: `${httpProxy}`,
              }
            : undefined,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--enable-webgl',
          ],
          channel: 'msedge',
        });
        this.browser_context = await browser.newContext();
      }
      this.runWithLLM = false;
    }

    this.browser_context.on('close', (page) => {
      this.eventEmitter.emit('close');
    });

    return this.browser_context;
  };

  getEnhancedContext = (modelProvider?: string) => {
    if (this.stagehand) {
      return this.stagehand.context;
    }
    return null;
  };

  stop = async () => {
    if (this.stagehand) {
      await this.stagehand.close();
      this.stagehand = undefined;
      this.eventEmitter.emit('close');
    } else if (this.browser_context) {
      await this.browser_context.close();
      const b = this.browser_context.browser();
      if (b) {
        await b.close();
      }
      this.browser_context = undefined;
      this.eventEmitter.emit('close');
    }
  };

  clear = async () => {
    if (
      this.instances?.config?.userDataPath &&
      fs.existsSync(this.instances?.config?.userDataPath)
    ) {
      await fs.promises.rm(this.instances?.config?.userDataPath, {
        recursive: true,
      });
    }
  };

  on(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.off(event, listener);
  }
}
