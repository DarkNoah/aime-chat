import { useTheme } from 'next-themes';
import React, { ForwardedRef } from 'react';
import {
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
} from '../../ai-elements/queue';
import { ChatTask } from '@/types/chat';

export type ChatTodoListProps = {
  className?: string;
  todos?: {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
  }[];
  tasks?: ChatTask[];
};

export interface ChatTodoListRef { }

export const ChatTodoList = React.forwardRef<
  ChatTodoListRef,
  ChatTodoListProps
>((props: ChatTodoListProps, ref: ForwardedRef<ChatTodoListRef>) => {
  const { todos, tasks } = props;
  const { theme } = useTheme();
  return (
    <div className={props.className}>
      <QueueList>
        {todos?.map((todo, i) => {
          const isCompleted = todo.status === 'completed';
          return (
            <QueueItem key={i}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator completed={isCompleted} />
                <QueueItemContent completed={isCompleted}>
                  {todo.content}
                </QueueItemContent>
              </div>
            </QueueItem>
          );
        })}
        {tasks?.map((task, i) => {
          const isCompleted = task.status === 'completed';
          return (
            <QueueItem key={i}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator completed={task.status === 'completed'} />
                <QueueItemContent completed={isCompleted}>
                  {`#${task.taskId} ${task.subject}`}
                </QueueItemContent>
              </div>
            </QueueItem>
          );
        })}
      </QueueList>
    </div>
  );
});
