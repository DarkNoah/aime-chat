import React, { useCallback } from 'react';
import { BackgroundTask, TaskStatus } from '@/types/task-queue';
import { Badge } from '@/renderer/components/ui/badge';
import { Button } from '@/renderer/components/ui/button';
import { Progress } from '@/renderer/components/ui/progress';
import { cn } from '@/renderer/lib/utils';
import {
  PauseIcon,
  PlayIcon,
  XIcon,
  Trash2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
  Loader2Icon,
  ClockIcon,
  BanIcon,
} from 'lucide-react';
import { useTaskQueueStore } from '@/renderer/store/use-task-queue-store';

const statusConfig: Record<
  TaskStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: '等待中',
    variant: 'secondary',
    icon: <ClockIcon className="size-3" />,
  },
  running: {
    label: '运行中',
    variant: 'default',
    icon: <Loader2Icon className="size-3 animate-spin" />,
  },
  paused: {
    label: '已暂停',
    variant: 'outline',
    icon: <PauseIcon className="size-3" />,
  },
  completed: {
    label: '已完成',
    variant: 'secondary',
    icon: <CheckCircle2Icon className="size-3" />,
  },
  failed: {
    label: '失败',
    variant: 'destructive',
    icon: <AlertCircleIcon className="size-3" />,
  },
  cancelled: {
    label: '已取消',
    variant: 'outline',
    icon: <BanIcon className="size-3" />,
  },
};

interface TaskItemProps {
  task: BackgroundTask;
}

export function TaskItem({ task }: TaskItemProps) {
  const { pauseTask, resumeTask, cancelTask, removeTask } =
    useTaskQueueStore();

  const config = statusConfig[task.status];
  const isActive = task.status === 'running' || task.status === 'paused';
  const isDone =
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'cancelled';

  const handlePauseResume = useCallback(() => {
    if (task.status === 'running') {
      pauseTask(task.id);
    } else if (task.status === 'paused') {
      resumeTask(task.id);
    }
  }, [task.id, task.status, pauseTask, resumeTask]);

  const handleCancel = useCallback(() => {
    cancelTask(task.id);
  }, [task.id, cancelTask]);

  const handleRemove = useCallback(() => {
    removeTask(task.id);
  }, [task.id, removeTask]);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors',
        isDone && 'opacity-60',
      )}
    >
      {/* 头部：名称 + 状态 */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-medium truncate">{task.name}</span>
        </div>
        <Badge variant={config.variant} className="shrink-0 gap-1">
          {config.icon}
          {config.label}
        </Badge>
      </div>

      {/* 进度条 */}
      {(task.status === 'running' || task.status === 'paused') && (
        <div className="mt-2 space-y-1">
          <Progress value={task.progress} className="h-1.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{task.progressText || ''}</span>
            <span>{Math.round(task.progress)}%</span>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {task.status === 'failed' && task.error && (
        <p className="mt-1.5 text-xs text-destructive truncate" title={task.error}>
          {task.error}
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 mt-2">
        {isActive && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handlePauseResume}
              title={task.status === 'running' ? '暂停' : '继续'}
            >
              {task.status === 'running' ? (
                <PauseIcon className="size-3.5" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              onClick={handleCancel}
              title="取消"
            >
              <XIcon className="size-3.5" />
            </Button>
          </>
        )}
        {task.status === 'pending' && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={handleCancel}
            title="取消"
          >
            <XIcon className="size-3.5" />
          </Button>
        )}
        {isDone && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleRemove}
            title="移除"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
