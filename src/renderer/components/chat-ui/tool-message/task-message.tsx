/* eslint-disable camelcase */
import { ToolUIPart } from 'ai';
import React, { ComponentProps, ForwardedRef, useMemo, useState } from 'react';
import { Label } from '../../ui/label';
import { Checkbox } from '../../ui/checkbox';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '../../ui/item';
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group';
import {
  IconCheck,
  IconFile,
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
import { FileIcon } from '../../file-icon';

export interface TaskMessageRef {}

export type TaskMessageProps = ComponentProps<typeof Card> & {
  part: ToolUIPart;
};

export const TaskMessage = React.forwardRef<TaskMessageRef, TaskMessageProps>(
  (props: TaskMessageProps, ref: ForwardedRef<TaskMessageRef>) => {
    const { className, part, title, ...rest } = props;

    const { description, prompt, subagent_type } = part?.input as {
      description: string;
      prompt: string;
      subagent_type: string;
    };

    return (
      <Item
        variant="outline"
        className="w-fit cursor-pointer bg-secondary p-2 gap-2 items-center"
      >
        <ItemContent>
          <ItemTitle>{description}</ItemTitle>
          <ItemDescription className=" ">
            <span className="truncate max-w-[300px] block">{prompt}</span>
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  },
);
