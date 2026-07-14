import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  ClockIcon,
  Loader2Icon,
  NetworkIcon,
  Trash2Icon,
  XIcon,
  XCircleIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/renderer/components/ui/sheet';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { cn } from '@/renderer/lib/utils';
import {
  formatSSHTarget,
  useSSHSessionStore,
} from '@/renderer/store/use-ssh-session-store';
import type { SSHSessionView } from '@/renderer/store/use-ssh-session-store';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const formatDuration = (startTime: string, endTime: string, t: Translate) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return t('ssh_status.duration_seconds', { count: 0 });
  }
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) {
    return t('ssh_status.duration_seconds', { count: seconds });
  }
  return t('ssh_status.duration_minutes_seconds', {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  });
};

const getStatus = (session: SSHSessionView) => {
  if (session.state === 'running') {
    return { labelKey: 'ssh_status.status_running', tone: 'running' as const };
  }
  if (
    session.state === 'error' ||
    (session.exitCode !== undefined && session.exitCode !== 0)
  ) {
    return { labelKey: 'ssh_status.status_failed', tone: 'failed' as const };
  }
  return { labelKey: 'ssh_status.status_exited', tone: 'success' as const };
};

function SessionStatusIcon({ session }: { session: SSHSessionView }) {
  const status = getStatus(session);
  if (status.tone === 'running') {
    return (
      <Loader2Icon className="size-4 animate-spin text-primary motion-reduce:animate-none" />
    );
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
  session: SSHSessionView;
  selected: boolean;
  onSelect: () => void;
  t: Translate;
}) {
  const status = getStatus(session);
  const target = formatSSHTarget(session.target);

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
          {target}
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
        <span className="truncate font-mono">{session.connectionId}</span>
      </div>
    </button>
  );
}

function TerminalScreen({
  session,
  t,
}: {
  session: SSHSessionView;
  t: Translate;
}) {
  const target = formatSSHTarget(session.target);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-200">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        <NetworkIcon className="size-4" />
        <span className="min-w-0 flex-1 truncate font-mono" title={target}>
          {target}
        </span>
        <Badge
          variant="outline"
          className="h-5 border-zinc-700 px-1.5 text-[10px] text-zinc-300"
        >
          {t('ssh_status.cursor', {
            row: session.cursor.row,
            column: session.cursor.column,
          })}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 font-mono text-xs">
          {session.screen ? (
            <pre className="whitespace-pre-wrap break-all text-zinc-200">
              {session.screen}
            </pre>
          ) : (
            <div className="flex items-center gap-2 text-zinc-500">
              <ClockIcon className="size-4" />
              <span>{t('ssh_status.waiting_output')}</span>
            </div>
          )}
          {session.error && (
            <pre className="mt-4 whitespace-pre-wrap break-all border-t border-zinc-800 pt-4 text-red-400">
              {session.error}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function SSHOutputPanel() {
  const { t } = useTranslation();
  const {
    sessions,
    order,
    isPanelOpen,
    selectedSessionId,
    setPanelOpen,
    selectSession,
    closeSession,
    clearExited,
  } = useSSHSessionStore();

  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  const selectedSession =
    (selectedSessionId && sessions[selectedSessionId]) || sessionList[0];
  const runningCount = sessionList.filter(
    (session) => session.state === 'running',
  ).length;
  const hasExited = sessionList.some((session) => session.state !== 'running');

  return (
    <Sheet open={isPanelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="bottom" className="h-[70vh] gap-0 p-0">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>{t('ssh_status.title')}</SheetTitle>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {t('ssh_status.running_count', { count: runningCount })}
            </Badge>
            {hasExited && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1 text-xs"
                onClick={clearExited}
              >
                <Trash2Icon className="size-3" />
                {t('ssh_status.clear_exited')}
              </Button>
            )}
          </div>
          <SheetDescription>{t('ssh_status.description')}</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(190px,260px)_1fr] gap-0 overflow-hidden">
          <div className="min-h-0 border-r bg-muted/20 p-3">
            <div className="h-full overflow-y-auto">
              <div className="space-y-2 pr-2">
                {sessionList.map((session) => (
                  <SessionListItem
                    key={session.connectionId}
                    session={session}
                    selected={
                      session.connectionId === selectedSession?.connectionId
                    }
                    onSelect={() => selectSession(session.connectionId)}
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
                    {t('ssh_status.duration_label')}:{' '}
                    {formatDuration(
                      selectedSession.startTime,
                      selectedSession.updatedAt,
                      t,
                    )}
                  </span>
                  {selectedSession.exitCode !== undefined && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {t('ssh_status.exit_code', {
                        code: selectedSession.exitCode,
                      })}
                    </Badge>
                  )}
                  {selectedSession.signal !== undefined && (
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {t('ssh_status.signal', {
                        signal: selectedSession.signal,
                      })}
                    </Badge>
                  )}
                  {selectedSession.state === 'running' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={() => closeSession(selectedSession.connectionId)}
                    >
                      <XIcon className="size-3" />
                      {t('ssh_status.close_connection')}
                    </Button>
                  )}
                </div>
                <TerminalScreen session={selectedSession} t={t} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('ssh_status.empty')}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
