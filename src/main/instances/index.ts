import {
  autoUpdater,
  UpdateInfo as ElectronUpdateInfo,
  ProgressInfo,
} from 'electron-updater';
import log from 'electron-log';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { AppChannel, InstancesChannel } from '@/types/ipc-channel';
import {
  UpdateInfo,
  UpdateProgress,
  UpdateState,
  UpdateStatus,
} from '@/types/app';
import { getMainWindow } from '../main';
import { BrowserContext, chromium } from 'playwright';
import { appManager } from '../app';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import chromePath from 'chrome-paths';
import { getEdgePath } from 'edge-paths';
import { Instances } from '@/entities/instances';
import { InstanceType } from '@/types/instance';
import { dbManager } from '../db';
import { Repository } from 'typeorm';
import { BaseInstance } from './base-instance';
import { BrowserInstance } from './browser-instance';
import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import { InstanceInfo as InstanceInfoType } from '@/types/instance';
import { getAgentBrowserRuntime } from '../app/runtime';
export interface BrowserProfile {
  name: string;
  userDataPath: string;
  browser: 'chrome' | 'edge';
  executablePath?: string;
}

export interface InstanceInfo extends Instances {
  instance: BaseInstance;
  browserContext?: BrowserContext;
  status: 'running' | 'stop';
}

export const DEFAULT_BROWSER_INSTANCE_ID = 'default_browser';
class InstancesManager extends BaseManager {
  DEFAULT_BROWSER_INSTANCE_ID = 'default_browser';
  instanceInfos: Map<string, InstanceInfo> = new Map();
  repository: Repository<Instances>;

  async init(): Promise<void> {
    this.repository = dbManager.dataSource.getRepository(Instances);
    await this.createDefaultInstance();
    return Promise.resolve();
  }

  constructor() {
    super();
  }

  public async getWebBrowserInstance(
    id: string = this.DEFAULT_BROWSER_INSTANCE_ID,
  ): Promise<InstanceInfo> {
    let instance = this.instanceInfos.get(id);
    if (!instance) {
      let instanceEntity = await this.repository.findOneBy({ id: id });
      if (!instanceEntity && id === this.DEFAULT_BROWSER_INSTANCE_ID) {
        instanceEntity = await this.createDefaultInstance();
      }
      if (instanceEntity.type === 'browser') {
        try {
          const browserInstance = new BrowserInstance({ instances: instance });
          const browserContext = await browserInstance.run();
          this.instanceInfos.set(id, {
            ...instanceEntity,
            instance: browserInstance,
            browserContext,
            status: 'running',
          });

          browserInstance.on('close', () => {
            this.instanceInfos.set(id, { ...instance, status: 'stop' });
            this.instanceInfos.delete(id);
          });
        } catch (err) {
          console.error(err);
          appManager.toast(err.message, { type: 'error' });
        }
      }
      instance = this.instanceInfos.get(id);
      if (!instance) {
        throw new Error('instance start failed');
      }
    }
    return instance;

    // const userDataDir = path.join(app.getPath('userData'), 'instances', id);
    // const httpProxy = await appManager.getProxy();
    // const executablePath = chromePath?.chrome || getEdgePath();
    // const browserContext = await chromium.launchPersistentContext(userDataDir, {
    //   headless: false,
    //   proxy: httpProxy
    //     ? {
    //         server: `${httpProxy}`,
    //       }
    //     : undefined,
    //   args: ['--disable-blink-features=AutomationControlled', '--enable-webgl'],
    //   // channel: 'msedge',
    //   executablePath: executablePath,
    // });
  }

  async createDefaultInstance() {
    let instance = await this.repository.findOneBy({
      id: this.DEFAULT_BROWSER_INSTANCE_ID,
    });
    const userDataPath = path.join(
      app.getPath('userData'),
      'instances',
      this.DEFAULT_BROWSER_INSTANCE_ID,
    );

    const executablePath = chromePath?.chrome || getEdgePath();
    if (!instance) {
      instance = new Instances(
        this.DEFAULT_BROWSER_INSTANCE_ID,
        'Default Browser',
        InstanceType.BROWSER,
        {
          executablePath: executablePath,
          userDataPath: userDataPath,
        },
      );
    }
    if (!instance?.config?.executablePath || !instance?.config?.userDataPath) {
      instance.config = {
        executablePath: executablePath,
        userDataPath: userDataPath,
      };
    }
    instance.static = true;
    return await this.repository.save(instance);
  }

  @channel(InstancesChannel.GetInstances)
  public async getInstances(): Promise<InstanceInfoType[]> {
    const list = await this.repository.find();
    return list.map((item) => {
      const instance = this.instanceInfos.get(item.id);
      if (!instance) {
        return {
          ...item,
          // instance: new BrowserInstance({ instances: item }),
          // browserContext: null,
          status: 'stop',
        }
      }
      return {
        ...item,
        // instance: instance,
        // browserContext: instance.browserContext,
        webSocketUrl: instance.instance?.webSocketUrl,
        status: instance.status,
      }
    });
  }

  @channel(InstancesChannel.GetInstance)
  public async getInstance(id: string): Promise<Instances | null> {
    return await this.repository.findOneBy({ id });
  }

  @channel(InstancesChannel.UpdateInstance)
  public async updateInstance(
    id: string,
    data: Partial<Pick<Instances, 'name' | 'config'>>,
  ): Promise<Instances> {
    const instance = await this.repository.findOneBy({ id });
    if (!instance) {
      throw new Error('Instance not found');
    }
    if (data.name !== undefined) {
      instance.name = data.name;
    }
    if (data.config !== undefined) {
      instance.config = { ...instance.config, ...data.config };
    }
    return await this.repository.save(instance);
  }

  @channel(InstancesChannel.DetectBrowserProfiles)
  public async detectBrowserProfiles(): Promise<BrowserProfile[]> {
    const profiles: BrowserProfile[] = [];

    // Default: app's own user data directory
    const defaultUserData = path.join(
      app.getPath('userData'),
      'instances',
      this.DEFAULT_BROWSER_INSTANCE_ID,
    );
    const defaultExePath = chromePath?.chrome || getEdgePath();
    profiles.push({
      name: 'Default (Built-in)',
      userDataPath: defaultUserData,
      browser: 'chrome',
      executablePath: defaultExePath || undefined,
    });
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA;

      if (localAppData) {
        // Chrome: %LOCALAPPDATA%\Google\Chrome\User Data
        const chromeUserData = path.join(
          localAppData,
          'Google',
          'Chrome',
          'User Data',
        );
        if (fs.existsSync(chromeUserData)) {
          profiles.push({
            name: 'Google Chrome',
            userDataPath: chromeUserData,
            browser: 'chrome',
            executablePath: chromePath?.chrome || undefined,
          });
        }

        // Edge: %LOCALAPPDATA%\Microsoft\Edge\User Data
        const edgeUserData = path.join(
          localAppData,
          'Microsoft',
          'Edge',
          'User Data',
        );
        if (fs.existsSync(edgeUserData)) {
          let edgeExePath: string | undefined;
          try {
            edgeExePath = getEdgePath();
          } catch {
            edgeExePath = undefined;
          }
          profiles.push({
            name: 'Microsoft Edge',
            userDataPath: edgeUserData,
            browser: 'edge',
            executablePath: edgeExePath,
          });
        }
      }
    } else if (process.platform === 'darwin') {
      const home = os.homedir();
      const applicationSupport = path.join(home, 'Library', 'Application Support');

      // Chrome: ~/Library/Application Support/Google/Chrome
      const chromeUserData = path.join(applicationSupport, 'Google', 'Chrome');
      if (fs.existsSync(chromeUserData)) {
        profiles.push({
          name: 'Google Chrome',
          userDataPath: chromeUserData,
          browser: 'chrome',
          executablePath: chromePath?.chrome || undefined,
        });
      }

      // Edge: ~/Library/Application Support/Microsoft Edge
      const edgeUserData = path.join(applicationSupport, 'Microsoft Edge');
      if (fs.existsSync(edgeUserData)) {
        let edgeExePath: string | undefined;
        try {
          edgeExePath = getEdgePath();
        } catch {
          edgeExePath = undefined;
        }
        profiles.push({
          name: 'Microsoft Edge',
          userDataPath: edgeUserData,
          browser: 'edge',
          executablePath: edgeExePath,
        });
      }
    }

    return profiles;
  }

  private async getCdpWebSocketUrl(port: number = 9222): Promise<string | null> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.webSocketDebuggerUrl || null;
    } catch {
      return null;
    }
  }

  /**
   * Wait for CDP port to become available, with retries.
   * Returns the webSocketDebuggerUrl when ready, or null on timeout.
   */
  private async waitForCdpReady(
    maxRetries: number = 10,
    intervalMs: number = 1000,
    port: number = 9222,
  ): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
      const wsUrl = await this.getCdpWebSocketUrl(port);
      if (wsUrl) return wsUrl;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  private async connectViaCdp(port: number = 9222): Promise<{ browserContext: BrowserContext; wsUrl: string }> {
    const wsUrl = await this.getCdpWebSocketUrl(port);
    if (!wsUrl) {
      throw new Error('CDP WebSocket URL not available');
    }

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const browserContext =
      browser.contexts().length > 0
        ? browser.contexts()[0]
        : await browser.newContext();

    const cdp = await browser.newBrowserCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "default" });

    return { browserContext, wsUrl };
  }

  @channel(InstancesChannel.RunInstance)
  public async runInstance(id: string) {
    const instance = await this.repository.findOneBy({ id });
    if (!instance) {
      throw new Error('Instance not found');
    }

    if (instance.type !== 'browser') {
      throw new Error('Unsupported instance type');
    }

    // Check if already running
    const existing = this.instanceInfos.get(id);
    if (existing && existing.status === 'running') {
      return { status: 'running', message: 'Instance is already running' };
    }

    const config = instance.config || {};
    const isSystemUserData =
      config.userDataPath &&
      !config.userDataPath.includes(app.getPath('userData'));



    const debugPort = config.debugPort || 9222;

    if (isSystemUserData || true) {
      let wsUrl = await this.getCdpWebSocketUrl(debugPort);


      if (!wsUrl) {
        const executablePath =
          config.executablePath || chromePath?.chrome || getEdgePath();

        if (!executablePath) {
          throw new Error('No browser executable found');
        }

        try {
          const browserProcess = spawn(
            executablePath,
            [
              `--remote-debugging-port=${debugPort}`,
              `--user-data-dir=${config.userDataPath}`,
            ],
            {
              detached: true,
              stdio: 'ignore',
            },
          );
          browserProcess.unref();
          wsUrl = await this.waitForCdpReady(15, 1000, debugPort);
        } catch (err) {
          throw new Error(`Failed to start browser: ${err.message}`);
        }
      }
      if (!wsUrl) {
        throw new Error('Failed to start browser');
      }

      const agentBrowserRuntime = await getAgentBrowserRuntime(true);
      if (agentBrowserRuntime.installed) {
        const httpProxy = await appManager.getProxy();
        let agentBrowserConfig = {
          "headed": true,
          // "profile": config.userDataPath,
          "cdp": wsUrl
        }
        if (httpProxy) {
          agentBrowserConfig['proxy'] = `http://${httpProxy}`;
        }
        await fs.promises.mkdir(path.join(app.getPath('home'), '.agent-browser'), { recursive: true });
        await fs.promises.writeFile(path.join(app.getPath('home'), '.agent-browser', 'config.json'), JSON.stringify(agentBrowserConfig, null, 2));
      }


      try {
        const { browserContext, wsUrl: cdpWsUrl } = await this.connectViaCdp(debugPort);
        const browserInstance = new BrowserInstance({ instances: instance });
        browserInstance.setBrowserContext(browserContext);
        browserInstance.setWebSocketUrl(cdpWsUrl);

        this.instanceInfos.set(id, {
          ...instance,
          instance: browserInstance,
          browserContext,
          status: 'running',
        });

        let hasReconnected = false;
        browserInstance.on('close', async (e) => {
          if (e?.reason === 'manual_stop') {
            this.instanceInfos.delete(id);
            return;
          }

          if (hasReconnected) {
            this.instanceInfos.delete(id);
            return;
          }

          hasReconnected = true;
          try {
            console.log('reconnecting...');
            await this.waitForCdpReady(5, 1000, debugPort);
            const { browserContext: newContext, wsUrl: newWsUrl } = await this.connectViaCdp(debugPort);

            browserInstance.setBrowserContext(newContext);
            browserInstance.setWebSocketUrl(newWsUrl);

            console.log('reconnected...');
            this.instanceInfos.set(id, {
              ...instance,
              instance: browserInstance,
              browserContext: newContext,
              status: 'running',
            });
          } catch {
            this.instanceInfos.delete(id);
          }
        });

        return { status: 'running', message: 'Connected via CDP' };
      } catch (err) {
        throw new Error(`Failed to connect via CDP: ${err.message}`);
      }
    } else {
      // Default mode: use playwright launchPersistentContext
      const browserInstance = new BrowserInstance({ instances: instance });
      const browserContext = await browserInstance.run();

      this.instanceInfos.set(id, {
        ...instance,
        instance: browserInstance,
        browserContext,
        status: 'running',
      });

      browserInstance.on('close', () => {
        this.instanceInfos.delete(id);
      });

      return { status: 'running', message: 'Browser launched' };
    }
  }

  @channel(InstancesChannel.StopInstance)
  public async stopInstance(id: string) {
    const info = this.instanceInfos.get(id);
    if (!info) {
      throw new Error('Instance is not running');
    }
    await info.instance.stop();
    this.instanceInfos.delete(id);
    return { status: 'stop' };
  }

  public getInstanceStatus(id: string): 'running' | 'stop' {
    const info = this.instanceInfos.get(id);
    return info?.status || 'stop';
  }
}

export const instancesManager = new InstancesManager();
