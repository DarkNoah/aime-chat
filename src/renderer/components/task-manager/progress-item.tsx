import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressItem as ProgressItemType } from '@/types/common';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import { Progress } from '@/renderer/components/ui/progress';
import { cn } from '@/renderer/lib/utils';
import { CheckCircle2Icon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useProgressStore } from '@/renderer/store/use-progress-store';

interface ProgressItemProps {
  item: ProgressItemType;
}

export function ProgressItem({ item }: ProgressItemProps) {
  const { t } = useTranslation();
  const { removeItem } = useProgressStore();

  const isRunning = item.status === 'running';
  const percent =
    typeof item.percent === 'number' ? Math.round(item.percent) : undefined;
  const hasPercent = typeof percent === 'number';

  const handleRemove = useCallback(() => {
    removeItem(item.id);
  }, [item.id, removeItem]);

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card p-3 transition-colors min-w-0',
        isRunning ? 'border-primary/30' : 'opacity-70',
      )}
    >
      {/* 头部：标题 + 状态 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium truncate line-clamp-1">
            {item.title || item.id}
          </span>
        </div>
        <Badge
          variant={isRunning ? 'default' : 'secondary'}
          className="shrink-0 gap-1"
        >
          {isRunning ? (
            <Loader2Icon className="size-3 animate-spin" />
          ) : (
            <CheckCircle2Icon className="size-3" />
          )}
          {isRunning
            ? t('task_manager.progress_running')
            : t('task_manager.progress_completed')}
        </Badge>
      </div>

      {/* 进度条 */}
      <div className="mt-2 space-y-1">
        {hasPercent ? (
          <Progress value={percent} className="h-1.5" />
        ) : isRunning ? (
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-progress-indeterminate" />
          </div>
        ) : (
          <Progress value={100} className="h-1.5" />
        )}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate" title={item.message}>
            {item.message || ''}
          </span>
          {hasPercent && <span className="shrink-0">{percent}%</span>}
        </div>
      </div>

      {/* 操作按钮：完成后可移除 */}
      {!isRunning && (
        <div className="mt-2 flex items-center justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={handleRemove}
            title={t('task_manager.action_remove')}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
