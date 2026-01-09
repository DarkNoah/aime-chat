import {
  autoUpdater,
  UpdateInfo as ElectronUpdateInfo,
  ProgressInfo,
} from 'electron-updater';
import log from 'electron-log';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { AppChannel } from '@/types/ipc-channel';
import {
  UpdateInfo,
  UpdateProgress,
  UpdateState,
  UpdateStatus,
} from '@/types/app';
import { getMainWindow } from '../main';
import { appManager } from '.';

class UpdateManager extends BaseManager {
  private updateState: UpdateState = {
    status: 'idle',
  };

  constructor() {
    super();
  }

  public async init(): Promise<void> {
    // 配置 electron-updater
    autoUpdater.logger = log;
    (autoUpdater.logger as typeof log).transports.file.level = 'info';

    // 禁用自动下载，我们要手动控制
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.forceDevUpdateConfig = true;

    // 注册事件监听
    this.setupEventListeners();

    // macOS 未签名应用无法使用自动更新，跳过自动检查
    // 用户仍可手动检查更新，但安装需要手动下载
    if (process.platform !== 'darwin') {
      this.checkForUpdates();
    } else {
      log.info('Skipping auto update check on macOS (unsigned app)');
    }

    log.info('UpdateManager initialized');
  }

  private setupEventListeners(): void {
    // 检查更新时
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.updateStatus('checking');
    });

    // 发现新版本
    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      log.info('Update available:', info);
      const updateInfo: UpdateInfo = {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => n.note).join('\n')
              : undefined,
        files: info.files?.map((f) => ({
          url: f.url,
          sha512: f.sha512,
          size: f.size,
        })),
      };
      this.updateState = {
        status: 'available',
        updateInfo,
      };
      this.sendToRenderer(AppChannel.UpdateAvailable, this.updateState);
    });

    // 没有新版本
    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      log.info('Update not available:', info);
      this.updateState = {
        status: 'not-available',
        updateInfo: {
          version: info.version,
        },
      };
      this.sendToRenderer(AppChannel.UpdateNotAvailable, this.updateState);
    });

    // 下载进度
    autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
      log.info(`Download progress: ${progressObj.percent.toFixed(2)}%`);
      const progress: UpdateProgress = {
        bytesPerSecond: progressObj.bytesPerSecond,
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
      };
      this.updateState = {
        ...this.updateState,
        status: 'downloading',
        progress,
      };
      this.sendToRenderer(AppChannel.UpdateDownloadProgress, this.updateState);
    });

    // 下载完成
    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      log.info('Update downloaded:', info);
      this.updateState = {
        ...this.updateState,
        status: 'downloaded',
        updateInfo: {
          version: info.version,
          releaseDate: info.releaseDate,
        },
      };
      this.sendToRenderer(AppChannel.UpdateDownloaded, this.updateState);
    });

    // 错误处理
    autoUpdater.on('error', (err: Error) => {
      log.error('Update error:', err);
      this.updateState = {
        status: 'error',
        error: err.message,
      };
      this.sendToRenderer(AppChannel.UpdateError, this.updateState);
    });
  }

  private updateStatus(status: UpdateStatus): void {
    this.updateState = {
      ...this.updateState,
      status,
    };
  }

  private sendToRenderer(channel: string, data: any): void {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  @channel(AppChannel.CheckForUpdates)
  public async checkForUpdates(): Promise<UpdateState> {
    try {
      log.info('Manual check for updates triggered');
      this.updateStatus('checking');
      await autoUpdater.netSession.setProxy({
        proxyRules:
          'http://' + appManager.appProxy.host + ':' + appManager.appProxy.port,
      });
      await autoUpdater.checkForUpdates();
      return this.updateState;
    } catch (error) {
      log.error('Check for updates failed:', error);
      this.updateState = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      this.sendToRenderer(AppChannel.UpdateError, this.updateState);
      return this.updateState;
    }
  }

  @channel(AppChannel.DownloadUpdate)
  public async downloadUpdate(): Promise<UpdateState> {
    try {
      log.info('Download update triggered');
      this.updateStatus('downloading');
      await autoUpdater.netSession.setProxy({
        proxyRules:
          'http://' + appManager.appProxy.host + ':' + appManager.appProxy.port,
      });
      await autoUpdater.downloadUpdate();
      return this.updateState;
    } catch (error) {
      log.error('Download update failed:', error);
      this.updateState = {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      return this.updateState;
    }
  }

  @channel(AppChannel.InstallUpdate)
  public async installUpdate(): Promise<void> {
    log.info('Install update triggered');
    // 退出并安装更新
    autoUpdater.quitAndInstall(false, true);
  }

  @channel(AppChannel.GetUpdateStatus)
  public async getUpdateStatus(): Promise<UpdateState> {
    return this.updateState;
  }
}

export const updateManager = new UpdateManager();
