import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBrowser, IconFolder, IconX } from '@tabler/icons-react';
import toast from 'react-hot-toast';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import { Spinner } from '@/renderer/components/ui/spinner';
import { useHeader } from '@/renderer/hooks/use-title';
import type { InstanceInfo } from '@/types/instance';
import { ThreadBrowserChannel } from '@/types/thread-browser';

function Instances() {
  const { setTitle } = useHeader();
  const { t } = useTranslation();
  const [instance, setInstance] = useState<InstanceInfo>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setTitle(t('settings.instances'));
  }, [setTitle, t]);
  useEffect(() => {
    let cancelled = false;
    let request = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      request += 1;
      const current = request;
      try {
        const values = await window.electron.instances.getInstances();
        if (!cancelled && current === request) {
          setInstance(values[0]);
          setError('');
        }
      } catch (reason) {
        if (!cancelled && current === request) setError(String(reason));
      }
    };
    load();
    const unsubscribe = window.electron.ipcRenderer.on(
      ThreadBrowserChannel.Changed,
      () => {
        clearTimeout(timer);
        timer = setTimeout(load, 100);
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [revision]);

  const closeTabs = async () => {
    if (!instance) return;
    setPending(true);
    setError('');
    try {
      await window.electron.instances.stopInstance(instance.id);
      setRevision((value) => value + 1);
      toast.success(t('settings.browser_tabs_closed'));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setPending(false);
    }
  };
  const openDirectory = async () => {
    if (!instance) return;
    try {
      await window.electron.app.openPath(instance.config.userDataPath);
    } catch (reason) {
      setError(String(reason));
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-4">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          <span className="break-words">{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {!instance && !error && (
        <div role="status" aria-label={t('common.loading')}>
          <Spinner />
        </div>
      )}
      {instance && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-medium">
              <IconBrowser className="size-5" />
              Electron Chromium
            </h2>
            <Badge variant="secondary">
              {instance.tabCount
                ? t('settings.instances_running')
                : t('settings.browser_on_demand')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('settings.browser_shared_description')}
          </p>
          <dl className="grid min-w-0 gap-4 border-y py-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">
                {t('settings.browser_engine_version')}
              </dt>
              <dd>{instance.chromiumVersion}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">
                {t('settings.browser_open_pages')}
              </dt>
              <dd>
                {t('settings.browser_page_count', {
                  tabs: instance.tabCount,
                  threads: instance.threadCount,
                })}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <dt className="text-muted-foreground">
                {t('settings.instances_user_data')}
              </dt>
              <dd className="break-all font-mono text-xs leading-relaxed">
                {instance.config.userDataPath}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={openDirectory}>
              <IconFolder className="size-4" />
              {t('settings.browser_open_directory')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!instance.tabCount || pending}
              onClick={closeTabs}
            >
              {pending ? <Spinner /> : <IconX className="size-4" />}
              {t('settings.browser_close_tabs')}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('settings.browser_close_tabs_hint')}
          </p>
        </>
      )}
    </div>
  );
}

export default Instances;
