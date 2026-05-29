import { GoalConfig } from '@/types/chat';
import { cn } from '@/renderer/lib/utils';
import { Ban, CheckCircle2, ShieldCheck } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ChatGoal } from './chat-goal';

type ChatGoalBannerProps = {
  goal?: GoalConfig | null;
  className?: string;
  onGoalChange?: (goal: GoalConfig) => void;
};

const getGoalStatusMeta = (
  status: GoalConfig['status'],
  t: ReturnType<typeof useTranslation>['t'],
) => {
  if (status === 'complete') {
    return {
      label: t('chat.goal_status_complete', 'Complete'),
      icon: CheckCircle2,
      badgeClassName:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }

  if (status === 'blocked') {
    return {
      label: t('chat.goal_status_blocked', 'Blocked'),
      icon: Ban,
      badgeClassName:
        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }

  return {
    label: t('chat.goal_status_pending', 'In progress'),
    icon: ShieldCheck,
    badgeClassName:
      'border-primary/30 bg-primary/10 text-primary dark:text-primary',
  };
};

export const ChatGoalBanner = ({
  goal,
  className,
  onGoalChange,
}: ChatGoalBannerProps) => {
  const { t } = useTranslation();
  const objective = goal?.objective?.trim() ?? '';
  const shouldShowFinishedGoal =
    goal?.status === 'complete' || goal?.status === 'blocked';

  if ((!goal?.enable && !shouldShowFinishedGoal) || objective.length === 0) {
    return null;
  }

  const status = getGoalStatusMeta(goal.status, t);
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 mb-3 bg-background/85 px-4 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        className,
      )}
      data-testid="chat-goal-banner"
    >
      <ChatGoal value={goal} onChange={onGoalChange}>
        <Button
          aria-label={t('chat.goal_open', 'Open goal settings')}
          className="h-auto w-full justify-start rounded-md border bg-background/95 px-3 py-2 text-left shadow-sm hover:bg-accent"
          type="button"
          variant="ghost"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span className="shrink-0 text-xs font-medium">
              {t('chat.goal', 'Goal')}
            </span>
            <Badge
              className={cn('h-5 shrink-0 gap-1 px-1.5', status.badgeClassName)}
              variant="outline"
            >
              <StatusIcon className="size-3" />
              {status.label}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">
              {objective}
            </span>
          </div>
        </Button>
      </ChatGoal>
    </div>
  );
};
