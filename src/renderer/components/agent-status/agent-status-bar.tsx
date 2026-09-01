import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BotIcon,
  CheckCircleIcon,
  Loader2Icon,
  XCircleIcon,
} from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import {
  FloatingLiquidGlassButton,
  FloatingLiquidGlassIcon,
  type FloatingLiquidGlassTone,
} from '@/renderer/components/ui/floating-liquid-glass-button';
import { useAgentSessionStore } from '@/renderer/store/use-agent-session-store';

export function AgentStatusBar() {
  const { t } = useTranslation();
  const { sessions, order, togglePanel } = useAgentSessionStore();
  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  if (sessionList.length === 0) return null;

  const runningCount = sessionList.filter(
    (session) => session.status === 'running',
  ).length;
  const failedCount = sessionList.filter(
    (session) => session.status === 'failed',
  ).length;
  const hasRunning = runningCount > 0;
  const hasFailed = failedCount > 0;

  let tone: FloatingLiquidGlassTone = 'success';
  let icon = <CheckCircleIcon className="size-3.5 text-emerald-600" />;
  let statusText = t('agent_status.badge_done');
  if (hasRunning) {
    tone = 'active';
    icon = (
      <Loader2Icon className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
    );
    statusText = t('agent_status.badge_running', { count: runningCount });
  } else if (hasFailed) {
    tone = 'danger';
    icon = <XCircleIcon className="size-3.5 text-destructive" />;
    statusText = t('agent_status.badge_failed', { count: failedCount });
  }

  return (
    <FloatingLiquidGlassButton
      floatingId="agent-status"
      initialBottom={64}
      tone={tone}
      onActivate={togglePanel}
      title={t('agent_status.open_panel')}
      aria-label={t('agent_status.open_panel')}
      aria-haspopup="dialog"
    >
      <FloatingLiquidGlassIcon tone={tone}>{icon}</FloatingLiquidGlassIcon>
      <BotIcon className="size-3.5 shrink-0 text-foreground/70" />
      <span className="shrink-0 font-semibold">
        {t('agent_status.badge_label')}
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
