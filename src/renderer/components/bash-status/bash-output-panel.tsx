import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  ClockIcon,
  Loader2Icon,
  TerminalIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/renderer/components/ui/sheet';
import { Button } from '@/renderer/components/ui/button';
import { Badge } from '@/renderer/components/ui/badge';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { cn } from '@/renderer/lib/utils';
import {
  BashSessionView,
  useBashSessionStore,
} from '@/renderer/store/use-bash-session-store';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const formatDuration = (
  startTime: string | undefined,
  endTime: string | undefined,
  t: Translate,
) => {
  if (!startTime) return t('bash_status.duration_seconds', { count: 0 });
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return t('bash_status.duration_seconds', { count: 0 });
  }

  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) {
    return t('bash_status.duration_seconds', { count: seconds });
  }

  const minutes = Math.floor(seconds / 60);
  return t('bash_status.duration_minutes_seconds', {
    minutes,
    seconds: seconds % 60,
  });
};

const getStatus = (session: BashSessionView) => {
  if (!session.isExited) {
    return { labelKey: 'bash_status.status_running', tone: 'running' as const };
  }
  if (session.exitCode === 0) {
    return {
      labelKey: 'bash_status.status_completed',
      tone: 'success' as const,
    };
  }
  return { labelKey: 'bash_status.status_failed', tone: 'failed' as const };
};

function SessionStatusIcon({ session }: { session: BashSessionView }) {
  const status = getStatus(session);
  if (status.tone === 'running') {
    return <Loader2Icon className="size-4 animate-spin text-primary" />;
  }
  if (status.tone === 'success') {
    return <CheckCircleIcon className="size-4 text-emerald-600" />;
  }
  return <XCircleIcon className="size-4 text-destructive" />;
}

function SessionListItem({
  session,
  selected,
  onSelect,
  t,
}: {
  session: BashSessionView;
  selected: boolean;
  onSelect: () => void;
  t: Translate;
}) {
  const status = getStatus(session);
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent',
        selected ? 'border-primary bg-accent' : 'border-border bg-background',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <SessionStatusIcon session={session} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.description || session.command}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className={cn(
            'h-5 px-1.5 text-[10px]',
            status.tone === 'failed' &&
              'border-destructive/50 text-destructive',
          )}
        >
          {t(status.labelKey)}
        </Badge>
        <span className="truncate">{session.bashId}</span>
      </div>
    </button>
  );
}

function TerminalOutput({
  session,
  t,
}: {
  session: BashSessionView;
  t: Translate;
}) {
  const hasOutput = session.stdout || session.stderr || session.errorMessage;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-200">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        <TerminalIcon className="size-4" />
        <span
          className="min-w-0 flex-1 truncate"
          title={session.directory || t('bash_status.home_directory')}
        >
          {session.directory || t('bash_status.home_directory')}
        </span>
        <Badge
          variant="outline"
          className="h-5 border-zinc-700 px-1.5 text-[10px] text-zinc-300"
        >
          {session.bashId}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 font-mono text-xs">
          <div className="flex items-start gap-2">
            <span className="select-none text-green-400">$</span>
            <pre className="whitespace-pre-wrap break-all text-zinc-100">
              {session.command}
            </pre>
          </div>

          {!hasOutput && (
            <div className="mt-4 flex items-center gap-2 text-zinc-500">
              <ClockIcon className="size-4" />
              <span>{t('bash_status.waiting_output')}</span>
            </div>
          )}

          {session.stdout && (
            <pre className="mt-4 whitespace-pre-wrap break-all text-zinc-300">
              {session.stdout}
            </pre>
          )}

          {session.stderr && (
            <pre className="mt-4 whitespace-pre-wrap break-all border-t border-zinc-800 pt-4 text-yellow-300/90">
              {session.stderr}
            </pre>
          )}

          {session.errorMessage && (
            <pre className="mt-4 whitespace-pre-wrap break-all border-t border-zinc-800 pt-4 text-red-400">
              {session.errorMessage}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function BashOutputPanel() {
  const { t } = useTranslation();
  const {
    sessions,
    order,
    isPanelOpen,
    selectedSessionId,
    setPanelOpen,
    selectSession,
    clearCompleted,
  } = useBashSessionStore();

  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  const selectedSession =
    (selectedSessionId && sessions[selectedSessionId]) || sessionList[0];
  const runningCount = sessionList.filter(
    (session) => !session.isExited,
  ).length;
  const hasCompleted = sessionList.some((session) => session.isExited);

  return (
    <Sheet open={isPanelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="bottom" className="h-[70vh] gap-0 p-0">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>{t('bash_status.title')}</SheetTitle>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {t('bash_status.running_count', { count: runningCount })}
            </Badge>
            {hasCompleted && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1 text-xs"
                onClick={clearCompleted}
              >
                <Trash2Icon className="size-3" />
                {t('bash_status.clear_completed')}
              </Button>
            )}
          </div>
          <SheetDescription>{t('bash_status.description')}</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-0 overflow-hidden">
          <div className="min-h-0 border-r bg-muted/20 p-3">
            <div className="h-full overflow-y-auto">
              <div className="space-y-2 pr-3">
                {sessionList.map((session) => (
                  <SessionListItem
                    key={session.bashId}
                    session={session}
                    selected={session.bashId === selectedSession?.bashId}
                    onSelect={() => selectSession(session.bashId)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 p-3">
            {selectedSession ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <SessionStatusIcon session={selectedSession} />
                  <span className="font-medium text-foreground">
                    {t(getStatus(selectedSession).labelKey)}
                  </span>
                  <span>
                    {t('bash_status.duration_label')}:{' '}
                    {formatDuration(
                      selectedSession.startTime,
                      selectedSession.updatedAt,
                      t,
                    )}
                  </span>
                  {selectedSession.exitCode !== undefined &&
                    selectedSession.exitCode !== null && (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {t('bash_status.exit_code', {
                          code: selectedSession.exitCode,
                        })}
                      </Badge>
                    )}
                  {selectedSession.processSignal && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {selectedSession.processSignal}
                    </Badge>
                  )}
                </div>
                <TerminalOutput session={selectedSession} t={t} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('bash_status.empty')}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
