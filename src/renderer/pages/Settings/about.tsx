import { useGlobal } from '@/renderer/hooks/use-global';
import { useHeader } from '@/renderer/hooks/use-title';
import { useTranslation } from 'react-i18next';
import logo from '@/../assets/icon.png';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import { useCallback } from 'react';
import { Progress } from '@/renderer/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/renderer/components/ui/card';
import {
  IconRefresh,
  IconDownload,
  IconCheck,
  IconX,
  IconLoader2,
  IconFileText,
  IconFolderOpen,
  IconDatabase,
  IconCpu,
  IconPackage,
  IconBug,
} from '@tabler/icons-react';
import { useUpdateState } from '@/renderer/hooks/use-update-state';

type PathItem = {
  label: string;
  value?: string;
  icon: typeof IconFolderOpen;
  onOpen: () => void;
};

export default function About() {
  const { t } = useTranslation();
  const { appInfo } = useGlobal();
  const { setTitle } = useHeader();
  setTitle(t('settings.about'));

  const updateState = useUpdateState();

  const handleCheckForUpdates = useCallback(async () => {
    await window.electron.app.checkForUpdates();
  }, []);

  const handleDownloadUpdate = useCallback(async () => {
    await window.electron.app.downloadUpdate();
  }, []);

  const handleInstallUpdate = useCallback(async () => {
    await window.electron.app.installUpdate();
  }, []);

  const handleOpenLogFile = useCallback(async () => {
    await window.electron.app.openLogFile();
  }, []);

  const createOpenPathHandler = useCallback((target?: string) => {
    return () => {
      if (target) {
        window.electron.app.openPath(target);
      }
    };
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
            {t('update.checking')}
          </Button>
        );

      case 'available':
        return (
          <Button size="sm" onClick={handleDownloadUpdate}>
            <IconDownload className="w-4 h-4 mr-1" />
            {t('update.downloadNew')} v{updateState.updateInfo?.version}
          </Button>
        );

      case 'downloading':
        return (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <div className="flex items-center gap-2">
              <IconLoader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">
                {t('update.downloading')}{' '}
                {updateState.progress?.percent.toFixed(1)}%
              </span>
            </div>
            <Progress value={updateState.progress?.percent || 0} />
            <span className="text-xs text-muted-foreground">
              {formatBytes(updateState.progress?.transferred || 0)} /{' '}
              {formatBytes(updateState.progress?.total || 0)}
              {' - '}
              {formatBytes(updateState.progress?.bytesPerSecond || 0)}/s
            </span>
          </div>
        );

      case 'downloaded':
        return (
          <Button size="sm" onClick={handleInstallUpdate} variant="default">
            <IconCheck className="w-4 h-4 mr-1" />
            {t('update.installNow')}
          </Button>
        );

      case 'not-available':
        return (
          <Button size="sm" variant="outline" onClick={handleCheckForUpdates}>
            <IconCheck className="w-4 h-4 mr-1" />
            {t('update.upToDate')}
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
              {t('update.retry')}
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
            {t('update.checkUpdate')}
          </Button>
        );
    }
  };

  const pathItems: PathItem[] = [
    {
      label: t('logFile'),
      value: t('openLogFile'),
      icon: IconFileText,
      onOpen: handleOpenLogFile,
    },
    {
      label: t('crashDumpPath'),
      value: appInfo?.crashDumpPath,
      icon: IconBug,
      onOpen: createOpenPathHandler(appInfo?.crashDumpPath),
    },
    {
      label: t('dataPath'),
      value: appInfo?.dataPath,
      icon: IconDatabase,
      onOpen: createOpenPathHandler(appInfo?.dataPath),
    },
    {
      label: t('userData'),
      value: appInfo?.userData,
      icon: IconFolderOpen,
      onOpen: createOpenPathHandler(appInfo?.userData),
    },
    {
      label: t('appData'),
      value: appInfo?.appData,
      icon: IconPackage,
      onOpen: createOpenPathHandler(appInfo?.appData),
    },
    {
      label: t('appPath'),
      value: appInfo?.appPath,
      icon: IconCpu,
      onOpen: createOpenPathHandler(appInfo?.appPath),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <Card className="overflow-hidden rounded-lg py-0">
        <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border bg-background">
              <img src={logo} alt="logo" className="size-12" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold leading-tight">
                  {appInfo.name}
                </h2>
                <Badge variant="secondary">v{appInfo.version}</Badge>
                {appInfo?.isPackaged === false && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Dev
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{appInfo.platform}</span>
                <span>{appInfo.systemVersion}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 justify-start md:justify-end">
            {renderUpdateButton()}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="gap-1">
          <CardTitle>{t('supportFiles')}</CardTitle>
          <CardDescription>{t('supportFilesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {pathItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.label}
                className="group grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/50"
                onClick={item.onOpen}
              >
                <span className="flex size-9 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-5">
                    {item.label}
                  </span>
                  <span className="block truncate text-xs leading-5 text-muted-foreground">
                    {item.value}
                  </span>
                </span>
                <IconFolderOpen className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
