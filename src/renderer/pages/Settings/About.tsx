import { Field, FieldGroup, FieldLabel } from '@/renderer/components/ui/field';
import { Separator } from '@/renderer/components/ui/separator';
import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import logo from '@/../assets/icon.png';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import { UpdateState } from '@/types/app';
import { AppChannel } from '@/types/ipc-channel';
import { useState, useEffect, useCallback } from 'react';
import { Progress } from '@/renderer/components/ui/progress';
import {
  IconRefresh,
  IconDownload,
  IconCheck,
  IconX,
  IconLoader2,
} from '@tabler/icons-react';

export default function About() {
  const { t } = useTranslation();
  const { appInfo, getAppInfo } = useGlobal();
  const { setTitle } = useHeader();
  setTitle(t('settings.about'));

  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
  });

  // 监听更新事件
  useEffect(() => {
    const handleUpdateAvailable = (state: UpdateState) => {
      setUpdateState(state);
    };

    const handleUpdateNotAvailable = (state: UpdateState) => {
      setUpdateState(state);
    };

    const handleDownloadProgress = (state: UpdateState) => {
      setUpdateState(state);
    };

    const handleUpdateDownloaded = (state: UpdateState) => {
      setUpdateState(state);
    };

    const handleUpdateError = (state: UpdateState) => {
      setUpdateState(state);
    };

    // 注册事件监听器
    window.electron.ipcRenderer.on(
      AppChannel.UpdateAvailable,
      handleUpdateAvailable,
    );
    window.electron.ipcRenderer.on(
      AppChannel.UpdateNotAvailable,
      handleUpdateNotAvailable,
    );
    window.electron.ipcRenderer.on(
      AppChannel.UpdateDownloadProgress,
      handleDownloadProgress,
    );
    window.electron.ipcRenderer.on(
      AppChannel.UpdateDownloaded,
      handleUpdateDownloaded,
    );
    window.electron.ipcRenderer.on(AppChannel.UpdateError, handleUpdateError);

    // 获取初始更新状态
    window.electron.app.getUpdateStatus().then((state: UpdateState) => {
      setUpdateState(state);
    });

    return () => {
      window.electron.ipcRenderer.removeAllListeners(
        AppChannel.UpdateAvailable,
      );
      window.electron.ipcRenderer.removeAllListeners(
        AppChannel.UpdateNotAvailable,
      );
      window.electron.ipcRenderer.removeAllListeners(
        AppChannel.UpdateDownloadProgress,
      );
      window.electron.ipcRenderer.removeAllListeners(
        AppChannel.UpdateDownloaded,
      );
      window.electron.ipcRenderer.removeAllListeners(AppChannel.UpdateError);
    };
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    setUpdateState({ status: 'checking' });
    await window.electron.app.checkForUpdates();
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    await window.electron.app.downloadUpdate();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await window.electron.app.installUpdate();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderUpdateButton = () => {
    switch (updateState.status) {
      case 'checking':
        return (
          <Button size="sm" disabled>
            <IconLoader2 className="w-4 h-4 mr-1 animate-spin" />
            {t('update.checking', '检查中...')}
          </Button>
        );

      case 'available':
        return (
          <Button size="sm" onClick={handleDownloadUpdate}>
            <IconDownload className="w-4 h-4 mr-1" />
            {t('update.downloadNew', '下载新版本')} v
            {updateState.updateInfo?.version}
          </Button>
        );

      case 'downloading':
        return (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <div className="flex items-center gap-2">
              <IconLoader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {t('update.downloading', '下载中...')}{' '}
                {updateState.progress?.percent.toFixed(1)}%
              </span>
            </div>
            <Progress value={updateState.progress?.percent || 0} />
            <span className="text-xs text-muted-foreground">
              {formatBytes(updateState.progress?.transferred || 0)} /{' '}
              {formatBytes(updateState.progress?.total || 0)}
              {' • '}
              {formatBytes(updateState.progress?.bytesPerSecond || 0)}/s
            </span>
          </div>
        );

      case 'downloaded':
        return (
          <Button size="sm" onClick={handleInstallUpdate} variant="default">
            <IconCheck className="w-4 h-4 mr-1" />
            {t('update.installNow', '立即安装')}
          </Button>
        );

      case 'not-available':
        return (
          <Button size="sm" variant="outline" onClick={handleCheckForUpdates}>
            <IconCheck className="w-4 h-4 mr-1" />
            {t('update.upToDate', '已是最新版本')}
          </Button>
        );

      case 'error':
        return (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCheckForUpdates}
            >
              <IconX className="w-4 h-4 mr-1" />
              {t('update.retry', '重试')}
            </Button>
            {updateState.error && (
              <span className="text-xs text-destructive">
                {updateState.error}
              </span>
            )}
          </div>
        );

      default:
        return (
          <Button size="sm" onClick={handleCheckForUpdates}>
            <IconRefresh className="w-4 h-4 mr-1" />
            {t('update.checkUpdate', '检查更新')}
          </Button>
        );
    }
  };

  return (
    <div className="flex flex-col p-4">
      <div className="p-4 flex flex-row gap-3">
        <img src={logo} alt="logo" className="size-[100px]"></img>
        <div className="flex flex-col gap-2">
          <span className="text-2xl font-bold flex flex-row items-center gap-2">
            {appInfo.name}
            {appInfo?.isPackaged === false && (
              <Badge
                variant="outline"
                className="text-muted-foreground  text-xs"
              >
                Dev
              </Badge>
            )}
          </span>
          <span className="text-sm text-gray-500">{appInfo.version}</span>
          <div className="flex flex-row gap-2">{renderUpdateButton()}</div>
        </div>
      </div>

      <Separator></Separator>
      <FieldGroup className="p-4">
        <Field>
          <FieldLabel>{t('dataPath')}</FieldLabel>
          <Button
            variant="link"
            className="flex-1 truncate justify-start bg-secondary"
            onClick={() => {
              window.electron.app.openPath(appInfo?.dataPath);
            }}
          >
            <span className="truncate">{appInfo?.dataPath}</span>
          </Button>
        </Field>
        <Field>
          <FieldLabel>{t('appData')}</FieldLabel>
          <Button
            variant="link"
            className="flex-1 truncate justify-start bg-secondary"
            onClick={() => {
              window.electron.app.openPath(appInfo?.appData);
            }}
          >
            <span className="truncate">{appInfo?.appData}</span>
          </Button>
        </Field>
        <Field>
          <FieldLabel>{t('appPath')}</FieldLabel>
          <Button
            variant="link"
            className="flex-1 truncate justify-start bg-secondary"
            onClick={() => {
              window.electron.app.openPath(appInfo?.appPath);
            }}
          >
            <span className="truncate">{appInfo?.appPath}</span>
          </Button>
        </Field>
        <Field>
          <FieldLabel>{t('userData')}</FieldLabel>
          <Button
            variant="link"
            className="flex-1 truncate justify-start bg-secondary"
            onClick={() => {
              window.electron.app.openPath(appInfo?.userData);
            }}
          >
            <span className="truncate">{appInfo?.userData}</span>
          </Button>
        </Field>
      </FieldGroup>
    </div>
  );
}
