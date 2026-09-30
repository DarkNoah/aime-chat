import { Not, Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { InstancesChannel } from '@/types/ipc-channel';
import { Instances } from '@/entities/instances';
import { InstanceType, type InstanceInfo } from '@/types/instance';
import { dbManager } from '../db';
import { threadBrowserManager } from '../browser/manager';
import { DEFAULT_BROWSER_INSTANCE_ID } from '../browser/profile';

export { DEFAULT_BROWSER_INSTANCE_ID } from '../browser/profile';

export class InstancesManager extends BaseManager {
  repository: Repository<Instances>;

  private browser = threadBrowserManager;

  async init() {
    this.repository = dbManager.dataSource.getRepository(Instances);
    const userDataPath = threadBrowserManager.prepareProfile();
    // Replace obsolete executable/CDP/profile settings only after disk migration
    // succeeds. Custom system-browser directories are never removed.
    await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Instances);
      await repository.delete({
        type: InstanceType.BROWSER,
        id: Not(DEFAULT_BROWSER_INSTANCE_ID),
      });
      const instance = new Instances(
        DEFAULT_BROWSER_INSTANCE_ID,
        'Electron Chromium',
        InstanceType.BROWSER,
        {
          engine: 'electron-chromium',
          userDataPath,
        },
      );
      instance.static = true;
      await repository.save(instance);
    });
  }

  @channel(InstancesChannel.GetInstances)
  async getInstances(): Promise<InstanceInfo[]> {
    const overview = this.browser.overview();
    return [
      {
        id: DEFAULT_BROWSER_INSTANCE_ID,
        name: 'Electron Chromium',
        type: InstanceType.BROWSER,
        static: true,
        config: {
          engine: 'electron-chromium',
          userDataPath: overview.userDataPath,
        },
        status: overview.tabCount ? 'running' : 'stop',
        tabCount: overview.tabCount,
        threadCount: overview.threadCount,
        chromiumVersion: overview.chromiumVersion,
      },
    ];
  }

  @channel(InstancesChannel.GetInstance)
  async getInstance(id: string) {
    return id === DEFAULT_BROWSER_INSTANCE_ID
      ? (await this.getInstances())[0]
      : null;
  }

  @channel(InstancesChannel.StopInstance)
  async stopInstance(id: string) {
    if (id !== DEFAULT_BROWSER_INSTANCE_ID)
      throw new Error('Unknown browser instance.');
    this.browser.closeAllTabs();
    return { status: 'stop' };
  }
}

export const instancesManager = new InstancesManager();
