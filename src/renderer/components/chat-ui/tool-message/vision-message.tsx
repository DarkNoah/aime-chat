/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import { ToolUIPart } from 'ai';
import React, {
  ComponentProps,
  ForwardedRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from '../chat-message-attachment';
import { FileInfo } from '@/types/common';
import { useChat } from '@/renderer/hooks/use-chat';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { isArray } from '@/utils/is';

export interface VisionMessageRef {}

export type VisionMessageProps = ComponentProps<typeof Card> & {
  threadId?: string;
  part: ToolUIPart;
};

export const VisionMessage = React.forwardRef<
  VisionMessageRef,
  VisionMessageProps
>((props: VisionMessageProps, ref: ForwardedRef<VisionMessageRef>) => {
  const { className, threadId, part, title, ...rest } = props;

  const [files, setFiles] = useState<any[]>([]);
  useEffect(() => {
    const { content = [] } = (part?.output as any) ?? { content: [] };
    if (isArray(content)) {
      const _files = [];
      for (const item of content) {
        if (item.type === 'image') {
          _files.push({
            type: item.type,
            data: item.data,
            mimeType: item.mimeType,
          });
        }
        setFiles(_files);
      }
    }
  }, [part?.output]);
  return (
    <div className="flex flex-row flex-wrap gap-2">
      <PhotoProvider>
        {files.map((item, i) => {
          if (item.mimeType?.startsWith('image/')) {
            return (
              <PhotoView
                src={`data:${item.mimeType};base64,${item.data}`}
                key={`${item.type}-${i}`}
              >
                <img
                  alt={item.name || 'attachment'}
                  className="size-full object-cover rounded-2xl max-w-[200px] max-h-[200px]"
                  height={100}
                  src={`data:${item.mimeType};base64,${item.data}`}
                  width={100}
                />
              </PhotoView>
            );
          }
        })}
      </PhotoProvider>
    </div>
  );
});
