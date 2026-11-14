import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  IconPlug,
  IconRobot,
  IconSparkles,
  IconTool,
  IconTools,
  type Icon,
} from '@tabler/icons-react';
import { cn } from '@/renderer/lib/utils';
import { useEntityIcon } from '@/renderer/hooks/use-entity-icon';
import { McpClientStatus } from '@/types/mcp';
import { avatarInitial, HubTab, seedHue } from './hub-model';

export const TAB_META: Record<HubTab, { icon: Icon; hue: number }> = {
  agents: { icon: IconRobot, hue: 255 },
  builtin: { icon: IconTool, hue: 70 },
  skills: { icon: IconSparkles, hue: 300 },
  connectors: { icon: IconPlug, hue: 175 },
};

const AVATAR_SIZE = {
  sm: 'size-7 rounded-md text-xs [&_svg]:size-3.5',
  md: 'size-10 rounded-lg text-sm [&_svg]:size-5',
  lg: 'size-12 rounded-xl text-base [&_svg]:size-6',
};

export function HubAvatar({
  hue,
  size = 'md',
  className,
  children,
}: {
  hue: number;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ '--avatar-h': hue } as CSSProperties}
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none',
        'bg-[oklch(0.94_0.04_var(--avatar-h))] text-[oklch(0.42_0.12_var(--avatar-h))]',
        'dark:bg-[oklch(0.32_0.06_var(--avatar-h))] dark:text-[oklch(0.86_0.08_var(--avatar-h))]',
        AVATAR_SIZE[size],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AgentAvatar({
  id,
  name,
  size,
  className,
}: {
  id: string | undefined;
  name: string | undefined;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  const icon = useEntityIcon('agents', id);
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const showIcon = icon && icon !== failedIcon;
  return (
    <HubAvatar hue={seedHue(id || name || '')} size={size} className={className}>
      {showIcon ? (
        <img
          src={icon}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedIcon(icon)}
        />
      ) : (
        avatarInitial(name)
      )}
    </HubAvatar>
  );
}

export const TOOLKIT_ICON: Icon = IconTools;

export function TypeAvatar({
  tab,
  icon,
  size,
  className,
}: {
  tab: HubTab;
  icon?: Icon;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  const { hue } = TAB_META[tab];
  const TypeIcon = icon ?? TAB_META[tab].icon;
  return (
    <HubAvatar hue={hue} size={size} className={className}>
      <TypeIcon />
    </HubAvatar>
  );
}

export type IndicatorTone = 'positive' | 'neutral' | 'negative' | 'pending';

const TONE_DOT: Record<IndicatorTone, string> = {
  positive: 'bg-emerald-500',
  neutral: 'bg-muted-foreground/40',
  negative: 'bg-destructive dark:bg-destructive-foreground',
  pending: 'bg-amber-500 motion-safe:animate-pulse',
};

export function StatusIndicator({
  tone,
  label,
  className,
}: {
  tone: IndicatorTone;
  label: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground',
        tone === 'negative' && 'text-destructive dark:text-destructive-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function mcpStatusTone(
  status: McpClientStatus | undefined,
  isActive?: boolean,
): IndicatorTone {
  if (status === 'running') return 'positive';
  if (status === 'starting') return 'pending';
  if (status === 'error') return 'negative';
  if (status === undefined && isActive) return 'positive';
  return 'neutral';
}

export function TagChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-36 items-center truncate rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
