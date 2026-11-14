import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconBrandGithub,
  IconMessageCircle,
  IconTool,
  IconUsers,
} from '@tabler/icons-react';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/components/ui/button';
import { Switch } from '@/renderer/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/renderer/components/ui/tooltip';
import {
  SkillIcon,
  useSkillDisplayName,
  useSkillGroupName,
} from '@/renderer/components/skills-ui/skill-metadata';
import { Agent } from '@/types/agent';
import { Tool } from '@/types/tool';
import {
  agentDetailPath,
  getRepoDisplayName,
  isCustomAgent,
  SkillGroup,
  skillGroupPath,
  toolDetailPath,
} from './hub-model';
import {
  AgentAvatar,
  HubAvatar,
  mcpStatusTone,
  StatusIndicator,
  TAB_META,
  TagChip,
  TOOLKIT_ICON,
  TypeAvatar,
} from './hub-visuals';

type HubCardProps = {
  to: string;
  title: string;
  media: ReactNode;
  titleAddon?: ReactNode;
  description?: ReactNode;
  tags?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  muted?: boolean;
};

export function HubCard({
  to,
  title,
  media,
  titleAddon,
  description,
  tags,
  meta,
  actions,
  muted,
}: HubCardProps) {
  return (
    <article
      className={cn(
        'group/card relative flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4',
        'transition-[background-color,border-color] duration-150 ease-out',
        'hover:border-foreground/15 hover:bg-accent/40',
        'has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn(muted && 'opacity-60')}>{media}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link
              to={to}
              className="truncate text-sm font-medium leading-5 outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {title}
            </Link>
            {titleAddon}
          </div>
          {description ? (
            <p className="line-clamp-2 text-xs leading-[1.125rem] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {tags ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">{tags}</div>
      ) : null}
      <div className="mt-auto flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          {meta}
        </div>
        {actions ? (
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            {actions}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActiveSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  );
}

export function AgentCard({
  agent,
  label,
  pending,
  onToggle,
  onChat,
}: {
  agent: Agent;
  label: string;
  pending?: boolean;
  onToggle: (checked: boolean) => void;
  onChat: () => void;
}) {
  const { t } = useTranslation();
  const toolCount = agent.tools?.length ?? 0;
  const subAgentCount = agent.subAgents?.length ?? 0;

  return (
    <HubCard
      to={agentDetailPath(agent.id!)}
      title={label}
      muted={!agent.isActive}
      media={<AgentAvatar id={agent.id} name={label} />}
      titleAddon={
        isCustomAgent(agent) ? null : (
          <TagChip className="shrink-0">{t('tools_hub.built_in_badge')}</TagChip>
        )
      }
      description={agent.description}
      tags={
        agent.tags?.length
          ? agent.tags.map((tag) => <TagChip key={tag}>{tag}</TagChip>)
          : null
      }
      meta={
        <>
          <span className="inline-flex items-center gap-1">
            <IconTool className="size-3.5" aria-hidden="true" />
            {t('tools_hub.tool_count', { count: toolCount })}
          </span>
          {subAgentCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <IconUsers className="size-3.5" aria-hidden="true" />
              {t('tools_hub.sub_agent_count', { count: subAgentCount })}
            </span>
          ) : null}
        </>
      }
      actions={
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground"
                aria-label={t('tools_hub.start_chat_with', { name: label })}
                disabled={!agent.isActive}
                onClick={onChat}
              >
                <IconMessageCircle />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tools_hub.start_chat')}</TooltipContent>
          </Tooltip>
          <ActiveSwitch
            checked={Boolean(agent.isActive)}
            disabled={pending}
            label={t('tools_hub.toggle_active', { name: label })}
            onCheckedChange={onToggle}
          />
        </>
      }
    />
  );
}

export function BuiltinToolCard({
  tool,
  label,
  subToolLabels = [],
  pending,
  onToggle,
}: {
  tool: Tool;
  label: string;
  subToolLabels?: string[];
  pending?: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const isToolkit = Boolean(tool.isToolkit);
  return (
    <HubCard
      to={toolDetailPath(tool.id)}
      title={label}
      muted={!tool.isActive}
      media={
        <TypeAvatar tab="builtin" icon={isToolkit ? TOOLKIT_ICON : undefined} />
      }
      titleAddon={
        isToolkit ? (
          <TagChip className="shrink-0">{t('tools_hub.toolkit_badge')}</TagChip>
        ) : null
      }
      description={tool.description}
      tags={
        subToolLabels.length
          ? subToolLabels
              .slice(0, 4)
              .map((name) => <TagChip key={name}>{name}</TagChip>)
          : null
      }
      meta={
        <>
          {isToolkit ? (
            <span className="inline-flex items-center gap-1">
              <IconTool className="size-3.5" aria-hidden="true" />
              {t('tools_hub.tool_count', { count: subToolLabels.length })}
            </span>
          ) : null}
          <StatusIndicator
            tone={tool.isActive ? 'positive' : 'neutral'}
            label={
              tool.isActive ? t('tools_hub.enabled') : t('tools_hub.disabled')
            }
          />
        </>
      }
      actions={
        <ActiveSwitch
          checked={Boolean(tool.isActive)}
          disabled={pending}
          label={t('tools_hub.toggle_active', { name: label })}
          onCheckedChange={onToggle}
        />
      }
    />
  );
}

export function SkillCard({
  skill,
  pending,
  onToggle,
}: {
  skill: Tool;
  pending?: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const skillName = useSkillDisplayName();
  const skillGroupName = useSkillGroupName();
  const name = skillName(skill);
  const tags = [
    ...(skill.category ? [skill.category] : []),
    ...(skill.tags ?? []).filter((tag) => tag !== skill.category).slice(0, 2),
  ];

  return (
    <HubCard
      to={toolDetailPath(skill.id)}
      title={name}
      muted={!skill.isActive}
      media={<SkillIcon skill={skill} className="size-10 rounded-lg" />}
      description={skill.description}
      tags={
        tags.length
          ? tags.map((tag) => <TagChip key={tag}>{tag}</TagChip>)
          : null
      }
      meta={
        <>
          {skill.autoLoad ? (
            <StatusIndicator tone="positive" label={t('tools.auto_load')} />
          ) : (
            <StatusIndicator
              tone={skill.isActive ? 'positive' : 'neutral'}
              label={
                skill.isActive ? t('tools_hub.enabled') : t('tools_hub.disabled')
              }
            />
          )}
          {skill.repo ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <IconBrandGithub className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {skillGroupName(getRepoDisplayName(skill.repo))}
              </span>
            </span>
          ) : null}
        </>
      }
      actions={
        <ActiveSwitch
          checked={Boolean(skill.isActive)}
          disabled={pending}
          label={t('tools_hub.toggle_active', { name })}
          onCheckedChange={onToggle}
        />
      }
    />
  );
}

export function SkillGroupCard({ group }: { group: SkillGroup }) {
  const { t } = useTranslation();
  const skillName = useSkillDisplayName();
  const skillGroupName = useSkillGroupName();
  const activeCount = group.skills.filter((skill) => skill.isActive).length;
  const autoLoadCount = group.skills.filter((skill) => skill.autoLoad).length;
  const preview = group.skills.slice(0, 4).map((skill) => skillName(skill));

  return (
    <HubCard
      to={skillGroupPath(group.id)}
      title={skillGroupName(group.name)}
      muted={activeCount === 0}
      media={
        <HubAvatar hue={TAB_META.skills.hue}>
          <IconBrandGithub />
        </HubAvatar>
      }
      description={group.id}
      tags={preview.map((name) => (
        <TagChip key={name}>{name}</TagChip>
      ))}
      meta={
        <>
          <span>{t('tools_hub.skill_count', { count: group.skills.length })}</span>
          <StatusIndicator
            tone={activeCount > 0 ? 'positive' : 'neutral'}
            label={t('tools_hub.group_active', {
              active: activeCount,
              count: group.skills.length,
            })}
          />
          {autoLoadCount > 0 ? (
            <span>
              {autoLoadCount === group.skills.length
                ? t('tools.auto_load_all')
                : t('tools.auto_load_partial', {
                  count: autoLoadCount,
                  total: group.skills.length,
                })}
            </span>
          ) : null}
        </>
      }
    />
  );
}

export function ConnectorCard({
  tool,
  pending,
  onToggle,
}: {
  tool: Tool;
  pending?: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const status = tool.status ?? (tool.isActive ? 'running' : 'stopped');
  return (
    <HubCard
      to={toolDetailPath(tool.id)}
      title={tool.name}
      muted={!tool.isActive}
      media={<TypeAvatar tab="connectors" />}
      description={tool.description}
      meta={
        <StatusIndicator
          tone={mcpStatusTone(tool.status, tool.isActive)}
          label={t(`tools_hub.mcp_status.${status}`)}
        />
      }
      actions={
        <ActiveSwitch
          checked={Boolean(tool.isActive)}
          disabled={pending || tool.status === 'starting'}
          label={t('tools_hub.toggle_active', { name: tool.name })}
          onCheckedChange={onToggle}
        />
      }
    />
  );
}

export function HubCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="size-10 shrink-0 animate-pulse rounded-lg bg-accent" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <div className="h-3.5 w-2/5 animate-pulse rounded bg-accent" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-accent" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-accent" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="h-3 w-16 animate-pulse rounded bg-accent" />
        <div className="h-4 w-8 animate-pulse rounded-full bg-accent" />
      </div>
    </div>
  );
}
