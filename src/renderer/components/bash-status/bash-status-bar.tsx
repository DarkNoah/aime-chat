import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  Loader2Icon,
  TerminalIcon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import {
  FloatingLiquidGlassButton,
  FloatingLiquidGlassIcon,
  type FloatingLiquidGlassTone,
} from '@/renderer/components/ui/floating-liquid-glass-button';
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
    statusIcon = (
      <Loader2Icon className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
    );
  } else if (hasFailed) {
    statusIcon = <XCircleIcon className="size-3.5 text-destructive" />;
  }

  let statusText = t('bash_status.badge_done');
  if (hasRunning) {
    statusText = t('bash_status.badge_running', { count: runningCount });
  } else if (hasFailed) {
    statusText = t('bash_status.badge_failed', { count: failedCount });
  }

  let tone: FloatingLiquidGlassTone = 'success';
  if (hasRunning) tone = 'active';
  else if (hasFailed) tone = 'danger';

  return (
    <FloatingLiquidGlassButton
      floatingId="bash-status"
      initialBottom={16}
      tone={tone}
      onActivate={togglePanel}
      title={t('bash_status.open_panel')}
      aria-label={t('bash_status.open_panel')}
      aria-haspopup="dialog"
    >
      <FloatingLiquidGlassIcon tone={tone}>
        {statusIcon}
      </FloatingLiquidGlassIcon>
      <TerminalIcon className="size-3.5 shrink-0 text-foreground/70" />
      <span className="shrink-0 font-semibold">
        {t('bash_status.badge_label')}
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
