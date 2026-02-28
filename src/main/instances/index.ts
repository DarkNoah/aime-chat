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

  /**
   * Get the webSocketDebuggerUrl from CDP port 9222.
   * Returns the URL string if available, or null if not.
   */
  private async getCdpWebSocketUrl(): Promise<string | null> {
    try {
      const response = await fetch('http://localhost:9222/json/version');
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
  ): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
      const wsUrl = await this.getCdpWebSocketUrl();
      if (wsUrl) return wsUrl;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
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

    if (isSystemUserData) {
      // System browser user data mode: use CDP port 9222
      let wsUrl = await this.getCdpWebSocketUrl();

      if (wsUrl) {
        // CDP port is already open, connect via webSocketDebuggerUrl
        try {
          const browser = await chromium.connectOverCDP("http://localhost:9222");
          const browserContext =
            browser.contexts().length > 0
              ? browser.contexts()[0]
              : await browser.newContext();


          const cdp = await browser.newBrowserCDPSession();
          await cdp.send("Browser.setDownloadBehavior", { behavior: "default" });
          const browserInstance = new BrowserInstance({ instances: instance });
          browserInstance.setBrowserContext(browserContext);
          browserInstance.setWebSocketUrl(wsUrl);
          // browserInstance.setBrowserProcess

          this.instanceInfos.set(id, {
            ...instance,
            instance: browserInstance,
            browserContext,
            status: 'running',
          });

          browserInstance.on('close', () => {
            this.instanceInfos.delete(id);
          });

          return { status: 'running', message: 'Connected via CDP' };
        } catch (err) {
          throw new Error(`Failed to connect via CDP: ${err.message}`);
        }
      } else {
        // CDP port not open, launch browser with remote debugging
        const executablePath =
          config.executablePath || chromePath?.chrome || getEdgePath();

        if (!executablePath) {
          throw new Error('No browser executable found');
        }

        try {
          const browserProcess = spawn(
            executablePath,
            [
              `--remote-debugging-port=9222`,
              `--user-data-dir=${config.userDataPath}`,
            ],
            {
              detached: true,
              stdio: 'ignore',
            },
          );

          browserProcess.unref();

          // Wait for CDP port and get webSocketDebuggerUrl
          wsUrl = await this.waitForCdpReady(15, 1000);
          if (!wsUrl) {
            // Kill the spawned browser process since CDP is not available
            try {
              browserProcess.kill();
            } catch {
              // ignore kill errors
            }
            throw new Error(
              'Browser started but CDP port did not become available. Please close all browser windows and try again.',
            );
          }

          // Connect via webSocketDebuggerUrl
          const browser = await chromium.connectOverCDP("http://localhost:9222");
          const cdp = await browser.newBrowserCDPSession();
          await cdp.send("Browser.setDownloadBehavior", { behavior: "default" });
          const browserContext =
            browser.contexts().length > 0
              ? browser.contexts()[0]
              : await browser.newContext();

          const browserInstance = new BrowserInstance({ instances: instance });
          browserInstance.setBrowserContext(browserContext);
          browserInstance.setBrowserProcess(browserProcess);
          browserInstance.setWebSocketUrl(wsUrl);

          this.instanceInfos.set(id, {
            ...instance,
            instance: browserInstance,
            browserContext,
            status: 'running',
          });

          browserInstance.on('close', () => {
            this.instanceInfos.delete(id);
          });

          return { status: 'running', message: 'Browser launched with CDP' };
        } catch (err) {
          if (
            err.message?.includes('locked') ||
            err.message?.includes('already')
          ) {
            throw new Error(
              'User data directory is locked. Please close the browser and try again.',
            );
          }
          throw err;
        }
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
