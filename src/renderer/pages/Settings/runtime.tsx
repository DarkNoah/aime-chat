import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useHeader } from '@/renderer/hooks/use-title';
import {
  IconBox,
  IconBrandNodejs,
  IconBrandSpeedtest,
  IconCheck,
  IconDownload,
  IconFolder,
  IconMicrophone,
  IconRefresh,
  IconScan,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { RuntimeInfo } from '@/types/app';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';

type RuntimeKey = keyof RuntimeInfo;

interface RuntimeDef {
  key: RuntimeKey;
  label: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** tailwind color classes for the icon container */
  iconClass: string;
  canUninstall: boolean;
}

const RUNTIME_DEFS: RuntimeDef[] = [
  {
    key: 'uv',
    label: 'UV',
    descKey: 'settings.runtime_page.desc_uv',
    icon: IconBox,
    iconClass: 'bg-purple-500/10 text-purple-500',
    canUninstall: true,
  },
  {
    key: 'node',
    label: 'Node.js',
    descKey: 'settings.runtime_page.desc_node',
    icon: IconBrandNodejs,
    iconClass: 'bg-green-600/10 text-green-600',
    canUninstall: false,
  },
  {
    key: 'paddleOcr',
    label: 'PaddleOCR',
    descKey: 'settings.runtime_page.desc_paddleOcr',
    icon: IconScan,
    iconClass: 'bg-blue-500/10 text-blue-500',
    canUninstall: true,
  },
  {
    key: 'bun',
    label: 'Bun',
    descKey: 'settings.runtime_page.desc_bun',
    icon: IconBrandSpeedtest,
    iconClass: 'bg-amber-500/10 text-amber-500',
    canUninstall: true,
  },
  {
    key: 'qwenAudio',
    label: 'QwenAudio',
    descKey: 'settings.runtime_page.desc_qwenAudio',
    icon: IconMicrophone,
    iconClass: 'bg-pink-500/10 text-pink-500',
    canUninstall: true,
  },
  {
    key: 'agentBrowser',
    label: 'Agent Browser',
    descKey: 'settings.runtime_page.desc_agentBrowser',
    icon: IconWorld,
    iconClass: 'bg-cyan-500/10 text-cyan-500',
    canUninstall: true,
  },
];

function Runtime() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('settings.runtime'));

  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const getRuntimeInfo = async () => {
    const data = await window.electron.app.getRuntimeInfo();
    setRuntimeInfo(data);
  };

  useEffect(() => {
    getRuntimeInfo();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await getRuntimeInfo();
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstallRuntime = async (pkg: RuntimeKey) => {
    setRuntimeInfo((prev) =>
      prev
        ? ({ ...prev, [pkg]: { ...prev[pkg], status: 'installing' } } as RuntimeInfo)
        : prev,
    );
    try {
      await window.electron.app.installRuntime(pkg);
    } catch (err) {
      toast.error(`Failed to install ${pkg} runtime.`);
    } finally {
      getRuntimeInfo();
    }
  };

  const handleUninstallRuntime = async (pkg: RuntimeKey) => {
    setRuntimeInfo((prev) =>
      prev
        ? ({ ...prev, [pkg]: { ...prev[pkg], status: 'installing' } } as RuntimeInfo)
        : prev,
    );
    try {
      await window.electron.app.uninstallRuntime(pkg);
    } catch (err) {
      toast.error(`Failed to uninstall ${pkg} runtime.`);
    } finally {
      getRuntimeInfo();
    }
  };

  const renderVersionBadges = (key: RuntimeKey) => {
    const badges: React.ReactNode[] = [];
    const info = runtimeInfo?.[key] as any;
    if (!info) return badges;

    if (info.version) {
      badges.push(
        <Badge key="version" variant="secondary">
          {info.version}
        </Badge>,
      );
    }
    if (key === 'node' && info.npmVersion) {
      badges.push(
        <Badge key="npm" variant="secondary">
          npm {info.npmVersion}
        </Badge>,
      );
    }
    if (key === 'uv' && info.pythonRuntime?.installed) {
      if (info.pythonRuntime.pythonVersion) {
        badges.push(
          <Badge key="python" variant="secondary">
            Python {info.pythonRuntime.pythonVersion}
          </Badge>,
        );
      }
      if (info.pythonRuntime.pipVersion) {
        badges.push(
          <Badge key="pip" variant="secondary">
            pip {info.pythonRuntime.pipVersion}
          </Badge>,
        );
      }
    }
    return badges;
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {t('settings.runtime_page.title')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('settings.runtime_page.subtitle')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Spinner className="size-4" />
            ) : (
              <IconRefresh className="size-4" />
            )}
            {t('settings.runtime_page.refresh')}
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {RUNTIME_DEFS.map((def) => {
            const info = runtimeInfo?.[def.key] as
              | { status?: string; path?: string }
              | undefined;
            const status = info?.status;
            const Icon = def.icon;

            return (
              <Item key={def.key} variant="outline" className="rounded-lg">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${def.iconClass}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex flex-wrap items-center gap-1.5">
                    {def.label}
                    {renderVersionBadges(def.key)}
                  </ItemTitle>
                  <ItemDescription className="truncate">
                    {t(def.descKey)}
                  </ItemDescription>
                  {info?.path && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto justify-start p-0 text-muted-foreground"
                      onClick={() => window.electron.app.openPath(info.path!)}
                    >
                      <IconFolder className="size-3.5" />
                      <span className="truncate">{info.path}</span>
                    </Button>
                  )}
                </ItemContent>
                <ItemActions>
                  {status === 'installing' && (
                    <Button disabled size="sm">
                      <Spinner className="size-4" />
                      {t('settings.runtime_page.installing')}
                    </Button>
                  )}
                  {status === 'installed' && (
                    <>
                      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                        <IconCheck className="size-3.5" />
                        {t('settings.runtime_page.installed')}
                      </Badge>
                      {def.canUninstall && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleUninstallRuntime(def.key)}
                        >
                          <IconTrash className="size-4" />
                          {t('settings.runtime_page.uninstall')}
                        </Button>
                      )}
                    </>
                  )}
                  {(status === 'not_installed' || status === undefined) && (
                    <Button size="sm" onClick={() => handleInstallRuntime(def.key)}>
                      <IconDownload className="size-4" />
                      {t('settings.runtime_page.install')}
                    </Button>
                  )}
                </ItemActions>
              </Item>
            );
          })}
        </div>
      </div>
    </ScrollArea>

  );
}

export default Runtime;
