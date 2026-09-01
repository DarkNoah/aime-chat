import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BotIcon,
  CheckCircleIcon,
  ClockIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  Trash2Icon,
  WrenchIcon,
  XCircleIcon,
  XIcon,
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
  AgentSessionView,
  useAgentSessionStore,
} from '@/renderer/store/use-agent-session-store';
import type { AgentSessionMessage } from '@/types/chat';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const formatDuration = (startTime: string, endTime: string, t: Translate) => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const seconds =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, Math.floor((end - start) / 1000))
      : 0;
  if (seconds < 60) {
    return t('agent_status.duration_seconds', { count: seconds });
  }
  return t('agent_status.duration_minutes_seconds', {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  });
};

function SessionIcon({ session }: { session: AgentSessionView }) {
  if (session.status === 'running') {
    return (
      <Loader2Icon className="size-4 animate-spin text-primary motion-reduce:animate-none" />
    );
  }
  if (session.status === 'completed') {
    return <CheckCircleIcon className="size-4 text-emerald-600" />;
  }
  return <XCircleIcon className="size-4 text-destructive" />;
}

const getStatusKey = (status: AgentSessionView['status']) =>
  `agent_status.status_${status}`;

function SessionListItem({
  session,
  selected,
  onSelect,
  t,
}: {
  session: AgentSessionView;
  selected: boolean;
  onSelect: () => void;
  t: Translate;
}) {
  return (
    <button
      type="button"
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-primary bg-accent' : 'border-border bg-background',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <SessionIcon session={session} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.description}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge
          variant="outline"
          className={cn(
            'h-5 px-1.5 text-[10px]',
            (session.status === 'failed' || session.status === 'aborted') &&
              'border-destructive/50 text-destructive',
          )}
        >
          {t(getStatusKey(session.status))}
        </Badge>
        <span className="truncate">{session.subagentType}</span>
      </div>
    </button>
  );
}

function AgentMessage({
  message,
  index,
  t,
}: {
  message: AgentSessionMessage;
  index: number;
  t: Translate;
}) {
  const isText = message.type === 'text';
  const isError = message.isError === true;
  let title = t('agent_status.message_label', { count: index + 1 });
  if (message.type === 'tool-call') {
    title = t('agent_status.tool_call_label', { tool: message.toolName });
  } else if (message.type === 'tool-result') {
    title = t('agent_status.tool_result_label', { tool: message.toolName });
  }

  return (
    <div
      className={cn(
        'rounded-lg bg-muted/45 p-3',
        isError && 'bg-destructive/10 text-destructive',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {isText ? (
          <MessageSquareTextIcon className="size-3.5" />
        ) : (
          <WrenchIcon className="size-3.5" />
        )}
        <span>{title}</span>
        {message.toolCallId ? (
          <span className="ml-auto max-w-40 truncate font-mono text-[10px] font-normal">
            {message.toolCallId}
          </span>
        ) : null}
      </div>
      <pre
        className={cn(
          'whitespace-pre-wrap break-words text-xs leading-5 text-foreground',
          !isText && 'font-mono',
          isError && 'text-destructive',
        )}
      >
        {message.content || t('agent_status.empty_output')}
      </pre>
    </div>
  );
}

function AgentOutput({
  session,
  t,
}: {
  session: AgentSessionView;
  t: Translate;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <BotIcon className="size-4 text-primary" />
          <span className="truncate">{session.description}</span>
          <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">
            {session.subagentType}
          </Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {session.prompt}
        </p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {session.messages.length === 0 && !session.errorMessage ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <ClockIcon className="size-4" />
              {t('agent_status.waiting_output')}
            </div>
          ) : null}
          {session.messages.map((message, index) => (
            <AgentMessage
              key={message.id}
              message={message}
              index={index}
              t={t}
            />
          ))}
          {session.errorMessage ? (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {session.errorMessage}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export function AgentOutputPanel() {
  const { t } = useTranslation();
  const {
    sessions,
    order,
    isPanelOpen,
    selectedSessionId,
    setPanelOpen,
    selectSession,
    stopSession,
    clearCompleted,
  } = useAgentSessionStore();
  const sessionList = useMemo(
    () => order.map((id) => sessions[id]).filter(Boolean),
    [order, sessions],
  );
  const selectedSession =
    (selectedSessionId && sessions[selectedSessionId]) || sessionList[0];
  const runningCount = sessionList.filter(
    (session) => session.status === 'running',
  ).length;
  const hasCompleted = sessionList.some(
    (session) => session.status !== 'running',
  );

  return (
    <Sheet open={isPanelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="bottom" className="h-[75vh] gap-0 p-0">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle>{t('agent_status.title')}</SheetTitle>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {t('agent_status.running_count', { count: runningCount })}
            </Badge>
            {hasCompleted ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1 text-xs"
                onClick={clearCompleted}
              >
                <Trash2Icon className="size-3" />
                {t('agent_status.clear_completed')}
              </Button>
            ) : null}
          </div>
          <SheetDescription>{t('agent_status.description')}</SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,32%)_minmax(0,1fr)] overflow-hidden">
          <div className="min-h-0 border-r bg-muted/20 p-3">
            <div className="h-full space-y-2 overflow-y-auto pr-2">
              {sessionList.map((session) => (
                <SessionListItem
                  key={session.sessionId}
                  session={session}
                  selected={session.sessionId === selectedSession?.sessionId}
                  onSelect={() => selectSession(session.sessionId)}
                  t={t}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 p-3">
            {selectedSession ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <SessionIcon session={selectedSession} />
                  <span className="font-medium text-foreground">
                    {t(getStatusKey(selectedSession.status))}
                  </span>
                  <span>
                    {t('agent_status.duration_label')}:{' '}
                    {formatDuration(
                      selectedSession.startTime,
                      selectedSession.updatedAt,
                      t,
                    )}
                  </span>
                  <span className="font-mono text-[10px]">
                    {selectedSession.sessionId}
                  </span>
                  {selectedSession.status === 'running' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-7 gap-1 text-xs text-destructive hover:text-destructive"
                      onClick={() => stopSession(selectedSession.sessionId)}
                    >
                      <XIcon className="size-3" />
                      {t('agent_status.stop_session')}
                    </Button>
                  ) : null}
                </div>
                <AgentOutput session={selectedSession} t={t} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('agent_status.empty')}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
