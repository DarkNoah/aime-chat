import React, { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/renderer/components/ui/sheet';
import { Button } from '@/renderer/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/renderer/components/ui/tabs';
import { ScrollArea } from '@/renderer/components/ui/scroll-area';
import { useTaskQueueStore } from '@/renderer/store/use-task-queue-store';
import { TaskItem } from './task-item';
import { Trash2Icon, InboxIcon } from 'lucide-react';
import { BackgroundTask } from '@/types/task-queue';

type FilterTab = 'all' | 'active' | 'done';

export function TaskManagerPanel() {
  const { tasks, isPanelOpen, setIsPanelOpen, clearCompleted } =
    useTaskQueueStore();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // 按 groupId 分组
  const groupedTasks = useMemo(() => {
    let filtered: BackgroundTask[];
    switch (activeTab) {
      case 'active':
        filtered = tasks.filter(
          (t) =>
            t.status === 'running' ||
            t.status === 'paused' ||
            t.status === 'pending',
        );
        break;
      case 'done':
        filtered = tasks.filter(
          (t) =>
            t.status === 'completed' ||
            t.status === 'failed' ||
            t.status === 'cancelled',
        );
        break;
      default:
        filtered = tasks;
    }

    const groups: Record<string, BackgroundTask[]> = {};
    for (const task of filtered) {
      if (!groups[task.groupId]) {
        groups[task.groupId] = [];
      }
      groups[task.groupId].push(task);
    }

    // 每个分组内按创建时间倒序
    for (const groupId of Object.keys(groups)) {
      groups[groupId].sort((a, b) => b.createdAt - a.createdAt);
    }

    return groups;
  }, [tasks, activeTab]);

  const groupIds = Object.keys(groupedTasks);
  const hasCompletedTasks = tasks.some(
    (t) =>
      t.status === 'completed' ||
      t.status === 'failed' ||
      t.status === 'cancelled',
  );

  return (
    <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>任务管理</SheetTitle>
            {hasCompletedTasks && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => clearCompleted()}
              >
                <Trash2Icon className="size-3" />
                清除已完成
              </Button>
            )}
          </div>
          <SheetDescription>查看和管理所有后台任务</SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as FilterTab)}
          className="flex-1 flex flex-col min-h-0 p-4"
        >
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              全部 ({tasks.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="flex-1">
              进行中 (
              {
                tasks.filter(
                  (t) =>
                    t.status === 'running' ||
                    t.status === 'paused' ||
                    t.status === 'pending',
                ).length
              }
              )
            </TabsTrigger>
            <TabsTrigger value="done" className="flex-1">
              已结束 (
              {
                tasks.filter(
                  (t) =>
                    t.status === 'completed' ||
                    t.status === 'failed' ||
                    t.status === 'cancelled',
                ).length
              }
              )
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full">
              {groupIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <InboxIcon className="size-10 mb-2 opacity-40" />
                  <p className="text-sm">暂无任务</p>
                </div>
              ) : (
                <div className="space-y-4 pr-4 pb-4">
                  {groupIds.map((groupId) => (
                    <div key={groupId}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {groupId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({groupedTasks[groupId].length})
                        </span>
                      </div>
                      <div className="space-y-2">
                        {groupedTasks[groupId].map((task) => (
                          <TaskItem key={task.id} task={task} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
