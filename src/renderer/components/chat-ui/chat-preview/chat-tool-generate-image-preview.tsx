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
import { splitContextAndFiles } from '@/utils/context-utils';
import { FileInfo } from '@/types/common';

export interface ChatToolGenerateImagePreviewRef {}

export type ChatToolGenerateImagePreviewProps = ComponentProps<typeof Card> & {
  part?: ToolUIPart;
};

export const ChatToolGenerateImagePreview = React.forwardRef<
  ChatToolGenerateImagePreviewRef,
  ChatToolGenerateImagePreviewProps
>(
  (
    props: ChatToolGenerateImagePreviewProps,
    ref: ForwardedRef<ChatToolGenerateImagePreviewRef>,
  ) => {
    const { className, part, ...rest } = props;
    const [outputImages, setOutputImages] = useState<FileInfo[]>([]);
    const [inputImages, setInputImages] = useState<FileInfo[]>([]);

    const { prompt = '', images: imagePaths = [] } = part?.input as {
      prompt?: string;
      images?: string[];
    };

    useEffect(() => {
      const handleSplitContextAndFiles = async () => {
        const text = part?.output as string;
        const { context, attachments } = await splitContextAndFiles(text);
        setOutputImages(attachments.filter((x) => x.isFile && x.isExist));
      };
      handleSplitContextAndFiles();
    }, [part?.output]);

    useEffect(() => {
      const handleSplitContextAndFiles = async () => {
        const fileInfo = [];
        for (const imagePath of imagePaths) {
          fileInfo.push(await window.electron.app.getFileInfo(imagePath));
          setInputImages(fileInfo);
        }
      };
      handleSplitContextAndFiles();
    }, [imagePaths]);

    return (
      <Item
        variant="outline"
        className="w-fit bg-secondary p-2 gap-2 items-center"
      >
        <ItemContent>
          <ItemTitle className="text-muted-foreground text-sm">
            {prompt}
          </ItemTitle>
          <ItemDescription className=" ">
            <ChatMessageAttachments className="ml-0">
              {inputImages.map((image, i) => (
                <div
                  key={`${image}-${i}`}
                  className="flex flex-col min-w-0 gap-2"
                >
                  <ChatMessageAttachment
                    className="size-50 cursor-pointer"
                    data={{
                      type: 'file',
                      mediaType: 'image/jpeg',
                      url: `file://${image.path}`,
                      filename: image.name,
                    }}
                  />
                  <small
                    className="w-full cursor-pointer min-w-0 max-w-[200px] truncate"
                    variant="ghost"
                    onClick={() => {
                      window.electron.app.openPath(image.path);
                    }}
                  >
                    {image.name}
                  </small>
                </div>
              ))}
            </ChatMessageAttachments>
          </ItemDescription>
        </ItemContent>
      </Item>
    );
  },
);
