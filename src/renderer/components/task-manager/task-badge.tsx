import React from 'react';
import { Button } from '@/renderer/components/ui/button';
import { cn } from '@/renderer/lib/utils';
import { ListTodoIcon, Loader2Icon } from 'lucide-react';
import { useTaskQueueStore } from '@/renderer/store/use-task-queue-store';

export function TaskBadge() {
  const { tasks, togglePanel } = useTaskQueueStore();

  const activeCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'pending',
  ).length;
  const hasRunning = tasks.some((t) => t.status === 'running');
  const hasTasks = tasks.length > 0;

  // 没有任何任务时不显示
  if (!hasTasks) return null;

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'fixed bottom-4 right-4 z-50 size-10 rounded-full shadow-lg',
        'border-border bg-background hover:bg-accent',
        hasRunning && 'border-primary/50',
      )}
      onClick={togglePanel}
      title="任务管理"
    >
      <div className="relative">
        {hasRunning ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <ListTodoIcon className="size-4" />
        )}
        {activeCount > 0 && (
          <span
            className={cn(
              'absolute -top-2 -right-2 flex items-center justify-center',
              'size-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground',
            )}
          >
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
      </div>
    </Button>
  );
}
