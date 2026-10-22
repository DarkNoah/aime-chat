import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { IconFolder } from '@tabler/icons-react';
import { Button } from '@/renderer/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/components/ui/alert-dialog';
import { Spinner } from '@/renderer/components/ui/spinner';
import type { RuntimeDirectoryInfo } from '@/types/app';

export default function RuntimeMigration({
  busy,
  onBusyChange,
}: {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<RuntimeDirectoryInfo>();
  const [destination, setDestination] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const cleanupPending = info?.migration?.cleanupPending;
  const active = migrating || !!(info?.migration && !cleanupPending);

  useEffect(() => {
    let mounted = true;
    const read = async () => {
      try {
        const result = await window.electron.app.getRuntimeDirectory();
        if (!mounted) return;
        setInfo(result);
        setFailed(false);
        if (result.migration) setDestination(result.migration.destination);
      } catch {
        if (mounted) setFailed(true);
      }
    };
    read();
    const timer = setInterval(read, 1500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    onBusyChange(active || selecting || confirmOpen);
  }, [active, selecting, confirmOpen, onBusyChange]);

  const selectDirectory = async () => {
    if (busy || active || selecting || !info) return;
    if (cleanupPending) {
      setDestination(info.migration!.destination);
      setConfirmOpen(true);
      return;
    }
    setSelecting(true);
    try {
      const result = await window.electron.app.showOpenDialog({
        defaultPath: destination || info?.defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      const selected = result.filePaths[0];
      if (!result.canceled && selected && selected !== info.path) {
        setDestination(selected);
        setConfirmOpen(true);
      }
    } catch {
      toast.error(t('settings.runtime_page.directory_select_error'));
    } finally {
      setSelecting(false);
    }
  };

  const migrate = async () => {
    if (busy || active || !destination.trim()) return;
    setConfirmOpen(false);
    setMigrating(true);
    try {
      await window.electron.app.migrateRuntimeDirectory(destination.trim());
      // The main process schedules the restart after replying to this IPC.
      setInfo(
        (current) =>
          current && {
            ...current,
            migration: { destination, phase: 'restarting' },
          },
      );
    } catch (error) {
      const message = String(error);
      const code = message.match(
        /RUNTIME_(?:MIGRATION|DIRECTORY)_[A-Z_]+/,
      )?.[0];
      const key = `settings.runtime_page.migration_errors.${code || 'UNKNOWN'}`;
      toast.error(
        t(key, {
          defaultValue: t('settings.runtime_page.migration_errors.UNKNOWN'),
        }),
      );
      setMigrating(false);
      try {
        setInfo(await window.electron.app.getRuntimeDirectory());
      } catch {
        setFailed(true);
      }
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t('settings.runtime_page.migration_title')}
    >
      <div>
        <h3 className="font-medium">
          {t('settings.runtime_page.migration_title')}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('settings.runtime_page.migration_description')}
        </p>
      </div>
      <p className="break-all text-sm">
        <span className="text-muted-foreground">
          {t('settings.runtime_page.current_directory')}:{' '}
        </span>
        {info?.path ||
          (failed ? t('settings.runtime_page.directory_load_failed') : '…')}
      </p>
      {cleanupPending && (
        <p role="alert" className="text-sm text-amber-600">
          {t('settings.runtime_page.cleanup_pending')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={selectDirectory}
          disabled={busy || active || selecting || !info}
        >
          {active || selecting ? (
            <Spinner className="size-4" />
          ) : (
            <IconFolder className="size-4" />
          )}
          {t(
            cleanupPending
              ? 'settings.runtime_page.retry_cleanup'
              : 'settings.runtime_page.change_directory',
          )}
        </Button>
        {active && (
          <p role="status" className="text-sm text-muted-foreground">
            {t(
              `settings.runtime_page.migration_phases.${info?.migration?.phase || 'downloading'}`,
            )}
          </p>
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(
                cleanupPending
                  ? 'settings.runtime_page.retry_cleanup'
                  : 'settings.runtime_page.confirm_directory_change',
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                cleanupPending
                  ? 'settings.runtime_page.cleanup_pending'
                  : 'settings.runtime_page.confirm_migration_description',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="space-y-2 break-all text-sm">
            {!cleanupPending && (
              <div>
                <dt className="text-muted-foreground">
                  {t('settings.runtime_page.current_directory')}
                </dt>
                <dd>{info?.path}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">
                {t('settings.runtime_page.new_directory')}
              </dt>
              <dd>{destination}</dd>
            </div>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={migrate} disabled={busy || active}>
              {t(
                cleanupPending
                  ? 'settings.runtime_page.retry_cleanup'
                  : 'settings.runtime_page.migrate_restart',
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
