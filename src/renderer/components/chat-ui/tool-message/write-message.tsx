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

export interface WriteMessageRef {}

export type WriteMessageProps = ComponentProps<typeof Card> & {
  part: ToolUIPart;
  title?: string;
};

export const WriteMessage = React.forwardRef<
  WriteMessageRef,
  WriteMessageProps
>((props: WriteMessageProps, ref: ForwardedRef<WriteMessageRef>) => {
  const { className, part, title, ...rest } = props;

  const file_path = part?.input?.file_path;
  const file_name = file_path.split('/')[file_path.split('/').length - 1];

  return (
    <Item
      variant="outline"
      className="w-fit cursor-pointer bg-secondary p-2 gap-2 items-center"
      onClick={() => {
        window.electron.app.openPath(file_path);
      }}
    >
      <ItemMedia>
        <FileIcon filePath={file_path} className="size-10" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{file_name}</ItemTitle>
        <ItemDescription className=" ">
          <span className="truncate max-w-[300px] block">{file_path}</span>
        </ItemDescription>
      </ItemContent>
    </Item>
  );
});
