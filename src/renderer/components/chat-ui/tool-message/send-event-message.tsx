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

export interface SendEventMessageRef {}

export type SendEventMessageProps = ComponentProps<typeof Card> & {
  threadId?: string;
  part: ToolUIPart;
};

export const SendEventMessage = React.forwardRef<
  SendEventMessageRef,
  SendEventMessageProps
>((props: SendEventMessageProps, ref: ForwardedRef<SendEventMessageRef>) => {
  const { className, threadId, part, title, ...rest } = props;
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [event, setEvent] = useState<string>('');
  const [data, setData] = useState<string>('');
  const { sendEvent } = useChat();

  useEffect(() => {
    setEvent(part?.input?.event as string);
    setData(part?.input?.data as string);
    const fetchFiles = async () => {
      if (part?.input?.event === 'files_preview') {
        const fileInfos: FileInfo[] = [];
        for (const file of JSON.parse(part?.input?.data as string).files) {
          const info = await window.electron.app.getFileInfo(file);
          if (info && info.isExist) {
            fileInfos.push(info);
          }
        }
        setFiles(fileInfos);
      }
    };
    fetchFiles();
  }, [part]);

  return (
    <>
      {event === 'web_preview' && (
        <Item
          variant="outline"
          className="w-fit cursor-pointer bg-secondary p-2 gap-2 items-center"
          onClick={() => {
            sendEvent(threadId, 'web_preview', JSON.parse(data));
          }}
        >
          <ItemContent>
            <ItemTitle>Web Preview</ItemTitle>
            <ItemDescription className=" ">
              <span className="truncate block">{JSON.parse(data).url}</span>
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
      {event === 'files_preview' && (
        <div className="flex flex-row flex-wrap gap-2">
          <PhotoProvider>
            {files.map((file, i) => {
              if (file.mimeType?.startsWith('image/')) {
                return (
                  <PhotoView
                    src={`file://${file.path}`}
                    key={`${file.path}-${i}`}
                  >
                    <img
                      alt={file.name || 'attachment'}
                      className="size-full object-cover rounded-2xl"
                      height={100}
                      src={`file://${file.path}`}
                      width={100}
                    />
                  </PhotoView>
                );
              } else if (file.mimeType?.startsWith('video/')) {
                return (
                  <video
                    src={`file://${file.path}`}
                    controls
                    className="w-full rounded-2xl"
                    key={`${file.path}-${i}`}
                  >
                    <track kind="captions" />
                  </video>
                );
              } else if (file.mimeType?.startsWith('audio/')) {
                return (
                  <audio
                    src={`file://${file.path}`}
                    controls
                    className="w-full"
                    key={`${file.path}-${i}`}
                  >
                    <track kind="captions" />
                  </audio>
                );
              } else if (file.mimeType?.startsWith('application/pdf')) {
                return (
                  <iframe
                    src={`file://${file.path}`}
                    className="w-full h-auto"
                    key={`${file.path}-${i}`}
                    title={file.name}
                  />
                );
              } else {
                return (
                  <Item
                    variant="outline"
                    className="w-fit cursor-pointer bg-secondary p-2 gap-2 items-center"
                    onClick={() => {
                      window.electron.app.openPath(file.path);
                    }}
                  >
                    <ItemMedia>
                      <FileIcon filePath={file.path} className="size-10" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{file.name}</ItemTitle>
                      <ItemDescription className=" ">
                        <span className="truncate max-w-[300px] block">
                          {file.path}
                        </span>
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                );
              }
            })}
          </PhotoProvider>
        </div>
      )}
    </>
  );
});
