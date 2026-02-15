/* eslint-disable no-nested-ternary */
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from '@/renderer/components/ui/item';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/components/ui/select';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useHeader } from '@/renderer/hooks/use-title';
import {
  IconBrowser,
  IconFolder,
  IconPlayerPlay,
  IconPlayerStop,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { InstanceInfo } from '@/types/instance';


interface BrowserProfile {
  name: string;
  userDataPath: string;
  browser: 'chrome' | 'edge';
  executablePath?: string;
}

interface InstanceConfig {
  executablePath?: string;
  userDataPath?: string;
  cdpUrl?: string;
  wssUrl?: string;
}


function Instances() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  setTitle(t('settings.instances'));

  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [runningStatus, setRunningStatus] = useState<Record<string, string>>(
    {},
  );

  const loadInstances = async () => {
    try {
      const data = await window.electron.instances.getInstances();
      setInstances(data);
      console.log(data);
      data.forEach((instance) => {
        setRunningStatus((prev) => ({
          ...prev,
          [instance.id]: instance.status,
        }));
      });
    } catch (err) {
      console.error('Failed to load instances', err);
    }
  };

  const loadProfiles = async () => {
    try {
      const data = await window.electron.instances.detectBrowserProfiles();
      setProfiles(data);
    } catch (err) {
      console.error('Failed to detect browser profiles', err);
    }
  };

  useEffect(() => {
    loadInstances();
    loadProfiles();
  }, []);

  const handleSelectProfile = async (
    instanceId: string,
    profileValue: string,
  ) => {
    const profile = profiles.find((p) => p.userDataPath === profileValue);
    if (!profile) return;

    try {
      await window.electron.instances.updateInstance(instanceId, {
        config: {
          userDataPath: profile.userDataPath,
          executablePath: profile.executablePath,
        },
      });
      await loadInstances();
      toast.success(t('settings.instances_config_saved'));
    } catch (err) {
      toast.error(err.message || 'Failed to update instance');
    }
  };

  const handleSelectCustomDir = async (instanceId: string) => {
    const res = await window.electron.app.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (res.canceled) return;
    const { filePaths } = res;
    if (filePaths.length !== 1) return;

    try {
      await window.electron.instances.updateInstance(instanceId, {
        config: {
          userDataPath: filePaths[0],
        },
      });
      await loadInstances();
      toast.success(t('settings.instances_config_saved'));
    } catch (err) {
      toast.error(err.message || 'Failed to update instance');
    }
  };

  const handleRunInstance = async (instanceId: string) => {
    setLoading((prev) => ({ ...prev, [instanceId]: true }));
    try {
      const result = await window.electron.instances.runInstance(instanceId);
      await loadInstances();
      toast.success(result?.message || t('settings.instances_started'));
    } catch (err) {
      toast.error(err.message || t('settings.instances_start_failed'));
    } finally {
      setLoading((prev) => ({ ...prev, [instanceId]: false }));
    }
  };

  const handleStopInstance = async (instanceId: string) => {
    setLoading((prev) => ({ ...prev, [instanceId]: true }));
    try {
      await window.electron.instances.stopInstance(instanceId);
      await loadInstances();
      toast.success(t('settings.instances_stopped'));
    } catch (err) {
      toast.error(err.message || 'Failed to stop instance');
    } finally {
      setLoading((prev) => ({ ...prev, [instanceId]: false }));
    }
  };

  const getSelectedProfile = (instance: InstanceInfo) => {
    if (!instance.config?.userDataPath) return undefined;
    const profile = profiles.find(
      (p) => p.userDataPath === instance.config?.userDataPath,
    );
    return profile ? profile.userDataPath : undefined;
  };

  const isCustomDir = (instance: InstanceInfo) => {
    if (!instance.config?.userDataPath) return false;
    return !profiles.find(
      (p) =>
        p.userDataPath === instance.config?.userDataPath,
    );
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {instances.map((instance) => (
        <Item key={instance.id} variant="outline">
          <ItemContent className="min-w-0">
            <ItemTitle>
              <IconBrowser className="size-4" />
              {instance.name}
              {runningStatus[instance.id] === 'running' && (
                <Badge variant="default" className="bg-green-500 text-white">
                  {t('settings.instances_running')}
                </Badge>
              )}
            </ItemTitle>
            <ItemDescription>
              <div className="flex flex-col gap-2 mt-2 w-full">
                {/* Browser profile selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t('settings.instances_user_data')}
                  </span>
                  <div className="flex flex-row gap-2 items-center">
                    <Select
                      value={getSelectedProfile(instance) || ''}
                      onValueChange={(value) =>
                        handleSelectProfile(instance.id, value)
                      }
                    >
                      <SelectTrigger className="w-64 h-8 text-xs">
                        <SelectValue
                          placeholder={t('settings.instances_select_browser')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((profile) => (
                          <SelectItem
                            key={profile.userDataPath}
                            value={profile.userDataPath}
                          >
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectCustomDir(instance.id)}
                    >
                      <IconFolder className="size-4" />
                      {t('settings.instances_browse')}
                    </Button>
                  </div>
                </div>

                {/* Show current path */}
                {instance.config?.userDataPath && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('settings.instances_current_path')}
                    </span>
                    <span className="text-xs font-mono truncate">
                      {instance.config.userDataPath}
                    </span>
                    {isCustomDir(instance) && (
                      <Badge variant="outline" className="w-fit text-xs">
                        {t('settings.instances_custom_dir')}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Executable path */}
                {instance.config?.executablePath && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('settings.instances_executable')}
                    </span>
                    <span className="text-xs font-mono truncate">
                      {instance.config.executablePath}
                    </span>
                  </div>
                )}
                {instance.webSocketUrl && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">
                      {t('settings.instances_websocketurl', 'WebSocketUrl')}
                    </span>
                    <span className="text-xs font-mono truncate">
                      {instance.webSocketUrl}
                    </span>
                  </div>
                )}
              </div>
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            {loading[instance.id] ? (
              <Button disabled size="sm">
                <Spinner />
              </Button>
            ) : runningStatus[instance.id] === 'running' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleStopInstance(instance.id)}
              >
                <IconPlayerStop className="size-4" />
                {t('settings.instances_stop')}
              </Button>
            ) : (
              <Button size="sm" onClick={() => handleRunInstance(instance.id)}>
                <IconPlayerPlay className="size-4" />
                {t('settings.instances_run')}
              </Button>
            )}
          </ItemActions>
        </Item>
      ))}

      {instances.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          {t('settings.instances_empty')}
        </div>
      )}
    </div>
  );
}

export default Instances;
