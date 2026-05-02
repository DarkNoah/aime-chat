import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  Loader2Icon,
  TerminalIcon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/components/ui/button';
import { useBashSessionStore } from '@/renderer/store/use-bash-session-store';

export function BashStatusBar() {
  const { t } = useTranslation();
  const { sessions, order, togglePanel } = useBashSessionStore();

  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  const latestSession = sessionList[0];
  const runningCount = sessionList.filter(
    (session) => !session.isExited,
  ).length;
  const failedCount = sessionList.filter(
    (session) => session.isExited && session.exitCode !== 0,
  ).length;

  if (!latestSession) return null;

  const hasRunning = runningCount > 0;
  const hasFailed = failedCount > 0;

  let statusIcon = <CheckCircleIcon className="size-3.5 text-emerald-600" />;
  if (hasRunning) {
    statusIcon = <Loader2Icon className="size-3.5 animate-spin text-primary" />;
  } else if (hasFailed) {
    statusIcon = <XCircleIcon className="size-3.5 text-destructive" />;
  }

  let statusText = t('bash_status.badge_done');
  if (hasRunning) {
    statusText = t('bash_status.badge_running', { count: runningCount });
  } else if (hasFailed) {
    statusText = t('bash_status.badge_failed', { count: failedCount });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'fixed bottom-4 left-4 z-50 h-9 max-w-[180px] gap-2 rounded-full px-2.5 pr-3 text-xs shadow-lg',
        'border-border/70 bg-background/85 backdrop-blur-md hover:bg-background',
        'dark:bg-zinc-950/85 dark:hover:bg-zinc-950',
        hasRunning && 'border-primary/45 shadow-primary/10',
        !hasRunning &&
          hasFailed &&
          'border-destructive/45 shadow-destructive/10',
      )}
      onClick={togglePanel}
      title={t('bash_status.open_panel')}
      aria-label={t('bash_status.open_panel')}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted',
          hasRunning && 'bg-primary/10',
          !hasRunning && hasFailed && 'bg-destructive/10',
        )}
      >
        {statusIcon}
      </span>
      <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium">
        {t('bash_status.badge_label')}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-muted-foreground tabular-nums',
          hasRunning && 'text-primary',
          !hasRunning && hasFailed && 'text-destructive',
        )}
      >
        {statusText}
      </span>
    </Button>
  );
}
