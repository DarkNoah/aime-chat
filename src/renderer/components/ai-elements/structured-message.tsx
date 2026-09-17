import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ChevronDownIcon,
  Clock3Icon,
  BotIcon,
  TerminalIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  getBashCompletionState,
  type AgentCompletionMessageTask,
  type BashCompletionMessageTask,
  type CronMessageData,
  type SkillMessageData,
  type StructuredMessageData,
} from '@/utils/structured-message';
import { Badge } from '../ui/badge';
import { SkillBadge } from '../ui/skill-badge';

const summaryClassName =
  'cursor-pointer rounded-sm text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function MessageField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  );
}

function TaskHeading({ title, state }: { title: string; state: string }) {
  const { t } = useTranslation();
  const successful = state === 'succeeded' || state === 'completed';
  const StatusIcon = successful ? CheckCircle2Icon : CircleAlertIcon;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <span className="min-w-0 break-words font-medium">{title}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs">
        <StatusIcon
          aria-hidden="true"
          className={`size-3.5 ${successful ? 'text-foreground' : 'text-destructive dark:text-destructive-foreground'}`}
        />
        {t(`chat.structured_message.${state}`)}
      </span>
    </div>
  );
}

function BashTask({ task }: { task: BashCompletionMessageTask }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-2 border-t border-border pt-3">
      <TaskHeading
        title={task.description || task.bashId}
        state={getBashCompletionState(task)}
      />
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-xs">
        {task.command}
      </pre>
      {task.errorMessage ? (
        <p className="whitespace-pre-wrap break-words text-xs text-foreground">
          {task.errorMessage}
        </p>
      ) : null}
      <details className="min-w-0">
        <summary className={summaryClassName}>
          {t('chat.structured_message.details')}
        </summary>
        <dl className="mt-2 space-y-1.5 text-xs">
          <MessageField label="Bash ID">{task.bashId}</MessageField>
          {task.directory ? (
            <MessageField label={t('chat.structured_message.directory')}>
              {task.directory}
            </MessageField>
          ) : null}
          {task.exitCode !== null && task.exitCode !== undefined ? (
            <MessageField label={t('chat.structured_message.exit_code')}>
              {task.exitCode}
            </MessageField>
          ) : null}
          {task.processSignal ? (
            <MessageField label={t('chat.structured_message.signal')}>
              {task.processSignal}
            </MessageField>
          ) : null}
          {task.startTime ? (
            <MessageField label={t('chat.structured_message.started_at')}>
              {task.startTime}
            </MessageField>
          ) : null}
          {task.finishedAt ? (
            <MessageField label={t('chat.structured_message.finished_at')}>
              {task.finishedAt}
            </MessageField>
          ) : null}
        </dl>
      </details>
    </div>
  );
}

function AgentTask({ agent }: { agent: AgentCompletionMessageTask }) {
  const { t } = useTranslation();
  const state = {
    completed: 'succeeded',
    failed: 'failed',
    aborted: 'terminated',
  }[agent.status];
  return (
    <div className="min-w-0 space-y-2 border-t border-border pt-3">
      <TaskHeading title={agent.description || agent.sessionId} state={state} />
      {agent.result ? (
        <div className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-sm">
          {agent.result}
        </div>
      ) : null}
      {agent.errorMessage ? (
        <p className="whitespace-pre-wrap break-words text-xs text-foreground">
          {agent.errorMessage}
        </p>
      ) : null}
      <details className="min-w-0">
        <summary className={summaryClassName}>
          {t('chat.structured_message.details')}
        </summary>
        <dl className="mt-2 space-y-1.5 text-xs">
          <MessageField label="Agent ID">{agent.sessionId}</MessageField>
          <MessageField label={t('chat.structured_message.agent_type')}>
            {agent.subagentType}
          </MessageField>
          {agent.startTime ? (
            <MessageField label={t('chat.structured_message.started_at')}>
              {agent.startTime}
            </MessageField>
          ) : null}
          {agent.finishedAt ? (
            <MessageField label={t('chat.structured_message.finished_at')}>
              {agent.finishedAt}
            </MessageField>
          ) : null}
        </dl>
      </details>
    </div>
  );
}

function BackgroundCompletion({
  type,
  title,
  icon: Icon,
  children,
}: {
  type: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section
      className="not-prose w-full min-w-0 space-y-3 whitespace-normal text-left text-sm"
      data-structured-message={type}
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {title}
      </div>
      {children}
    </section>
  );
}

function SkillBody({ skill }: { skill: SkillMessageData }) {
  return (
    <div
      className="not-prose min-w-0 whitespace-pre-wrap break-words text-left text-sm leading-relaxed"
      data-structured-message="skill"
    >
      <SkillBadge title={`/${skill.id}`}>/{skill.name}</SkillBadge>
      {skill.args}
    </div>
  );
}

function CronBody({ cron }: { cron: CronMessageData }) {
  const { t } = useTranslation();
  const label = t('chat.structured_message.cron_triggered', {
    name: cron.name,
  });
  return (
    <details
      className="group/cron not-prose max-w-xl min-w-0 text-left text-sm"
      data-structured-message="cron"
      data-structured-message-compact
    >
      <summary className="flex min-w-0 cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Badge
          variant="secondary"
          className="max-w-full min-w-0 gap-1.5"
          title={label}
        >
          <Clock3Icon aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="shrink-0 group-open/cron:rotate-180"
          />
        </Badge>
      </summary>
      <div className="mt-2 min-w-0 space-y-3 rounded-lg border border-border bg-secondary p-3">
        {cron.prompt ? (
          <p className="whitespace-pre-wrap break-words">{cron.prompt}</p>
        ) : null}
        <dl className="space-y-1.5 text-xs">
          <MessageField label={t('chat.structured_message.started_at')}>
            {cron.startedAt}
          </MessageField>
          {cron.trigger ? (
            <MessageField label={t('chat.structured_message.trigger')}>
              {t(`chat.structured_message.trigger_${cron.trigger}`)}
            </MessageField>
          ) : null}
          {cron.previousRunAt ? (
            <MessageField label={t('chat.structured_message.previous_run_at')}>
              {cron.previousRunAt}
            </MessageField>
          ) : null}
        </dl>
      </div>
    </details>
  );
}

export function StructuredMessage({ data }: { data: StructuredMessageData }) {
  const { t } = useTranslation();
  if (data.type === 'skill') return <SkillBody skill={data.skill} />;
  if (data.type === 'cron') return <CronBody cron={data.cron} />;
  if (data.type === 'background-agent-completion') {
    return (
      <BackgroundCompletion
        type={data.type}
        icon={BotIcon}
        title={t('chat.structured_message.background_agents_completed', {
          count: data.agents.length,
        })}
      >
        {data.agents.map((agent, index) => (
          <AgentTask key={`${agent.sessionId}-${index}`} agent={agent} />
        ))}
      </BackgroundCompletion>
    );
  }
  return (
    <BackgroundCompletion
      type={data.type}
      icon={TerminalIcon}
      title={t('chat.structured_message.background_completed', {
        count: data.tasks.length,
      })}
    >
      {data.tasks.map((task, index) => (
        <BashTask key={`${task.bashId}-${index}`} task={task} />
      ))}
    </BackgroundCompletion>
  );
}
