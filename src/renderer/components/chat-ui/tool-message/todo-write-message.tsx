import { ToolUIPart } from 'ai';
import React, { ComponentProps, ForwardedRef, useMemo, useState } from 'react';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import { Item, ItemContent, ItemDescription, ItemTitle } from '../../ui/item';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group';
import {
  IconCheck,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react';
import { Button } from '../../ui/button';
import { RadioGroup, RadioGroupItem } from '../../ui/radio-group';
import { Card } from '../../ui/card';
import {
  Queue,
  QueueItem,
  QueueItemActions,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '../../ai-elements/queue';

export interface TodoWriteMessageRef {}

export type TodoWriteMessageProps = ComponentProps<typeof Card> & {
  part: ToolUIPart;
  title?: string;
};

export const TodoWriteMessage = React.forwardRef<
  TodoWriteMessageRef,
  TodoWriteMessageProps
>((props: TodoWriteMessageProps, ref: ForwardedRef<TodoWriteMessageRef>) => {
  const { className, part, title, ...rest } = props;

  return (
    <Queue className="w-fit min-w-[300px]">
      <QueueSection>
        <QueueSectionTrigger>
          <QueueSectionLabel count={part?.input?.todos?.length} label="Todo" />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {part?.input?.todos?.map((todo, i) => {
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
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
});
