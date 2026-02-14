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
import { app } from 'electron';
import chromePath from 'chrome-paths';
import { getEdgePath } from 'edge-paths';
import { Instances } from '@/entities/instances';
import { InstanceType } from '@/types/instance';
import { dbManager } from '../db';
import { Repository } from 'typeorm';
import { BaseInstance } from './base-instance';
import { BrowserInstance } from './browser-instance';

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
  public async getInstances(): Promise<Instances[]> {
    return await this.repository.find();
  }

  @channel(InstancesChannel.RunInstance)
  public async runInstance(id: string) {
    const instance = await this.repository.findOneBy({ id });
    if (!instance) {
      throw new Error('Instance not found');
    }
    if (instance.type === 'browser') {
      const browserInstance = new BrowserInstance({ instances: instance });
      await browserInstance.run();
    }
  }
}

export const instancesManager = new InstancesManager();
