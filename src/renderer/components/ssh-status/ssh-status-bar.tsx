import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  Loader2Icon,
  NetworkIcon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import {
  FloatingLiquidGlassButton,
  FloatingLiquidGlassIcon,
  type FloatingLiquidGlassTone,
} from '@/renderer/components/ui/floating-liquid-glass-button';
import { useSSHSessionStore } from '@/renderer/store/use-ssh-session-store';

export function SSHStatusBar() {
  const { t } = useTranslation();
  const { sessions, order, togglePanel } = useSSHSessionStore();

  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  const runningCount = sessionList.filter(
    (session) => session.state === 'running',
  ).length;
  const failedCount = sessionList.filter(
    (session) =>
      session.state === 'error' ||
      (session.state === 'exited' &&
        session.exitCode !== undefined &&
        session.exitCode !== 0),
  ).length;

  if (sessionList.length === 0) return null;

  const hasRunning = runningCount > 0;
  const hasFailed = failedCount > 0;
  let statusIcon = <CheckCircleIcon className="size-3.5 text-emerald-600" />;
  let statusText = t('ssh_status.badge_done');

  if (hasRunning) {
    statusIcon = (
      <Loader2Icon className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
    );
    statusText = t('ssh_status.badge_connected', { count: runningCount });
  } else if (hasFailed) {
    statusIcon = <XCircleIcon className="size-3.5 text-destructive" />;
    statusText = t('ssh_status.badge_failed', { count: failedCount });
  }

  let tone: FloatingLiquidGlassTone = 'success';
  if (hasRunning) tone = 'active';
  else if (hasFailed) tone = 'danger';

  return (
    <FloatingLiquidGlassButton
      floatingId="ssh-status"
      initialBottom={68}
      tone={tone}
      onActivate={togglePanel}
      title={t('ssh_status.open_panel')}
      aria-label={t('ssh_status.open_panel')}
      aria-haspopup="dialog"
    >
      <FloatingLiquidGlassIcon tone={tone}>
        {statusIcon}
      </FloatingLiquidGlassIcon>
      <NetworkIcon className="size-3.5 shrink-0 text-foreground/70" />
      <span className="shrink-0 font-semibold">
        {t('ssh_status.badge_label')}
      </span>
      <span
        className={cn(
          'min-w-0 truncate text-foreground/70 tabular-nums',
          hasRunning && 'text-primary',
          !hasRunning && hasFailed && 'text-destructive',
        )}
      >
        {statusText}
      </span>
    </FloatingLiquidGlassButton>
  );
}
