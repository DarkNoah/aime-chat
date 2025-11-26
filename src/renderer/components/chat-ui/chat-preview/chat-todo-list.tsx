import { useTheme } from 'next-themes';
import React, { ForwardedRef } from 'react';
import {
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
} from '../../ai-elements/queue';

export type ChatTodoListProps = {
  className?: string;
  todos?: {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
  }[];
};

export interface ChatTodoListRef {}

export const ChatTodoList = React.forwardRef<
  ChatTodoListRef,
  ChatTodoListProps
>((props: ChatTodoListProps, ref: ForwardedRef<ChatTodoListRef>) => {
  const { todos } = props;
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
      </QueueList>
    </div>
  );
});
