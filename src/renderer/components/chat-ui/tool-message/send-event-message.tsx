/* eslint-disable no-await-in-loop */
/* eslint-disable camelcase */
import { ToolUIPart } from 'ai';
import React, {
  ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '../../ui/item';
import { Card } from '../../ui/card';
import { FileIcon } from '../../file-icon';
import { FileInfo } from '@/types/common';
import { useChat } from '@/renderer/hooks/use-chat';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { ModelViewer, isSupportedModelFile } from '../../model-viewer';
import { cn } from '@/renderer/lib/utils';

const toFileUrl = (filePath: string) => new URL(filePath, 'file:').href;

type SendEventInput = {
  event?: string;
  data?: string;
};

export interface SendEventMessageRef {}

export type SendEventMessageProps = ComponentProps<typeof Card> & {
  threadId?: string;
  part: ToolUIPart;
};

const isImageFile = (file: FileInfo) => file.mimeType?.startsWith('image/');

const isPreviewCardFile = (file: FileInfo) =>
  (file.mimeType?.startsWith('video/') && file.ext?.toLowerCase() !== '.ts') ||
  file.mimeType?.startsWith('audio/') ||
  isSupportedModelFile(file.ext) ||
  file.mimeType?.startsWith('application/pdf');

export const SendEventMessage = React.forwardRef<
  SendEventMessageRef,
  SendEventMessageProps
>((props: SendEventMessageProps, _ref) => {
  const { className, threadId, part, title, ...rest } = props;
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [event, setEvent] = useState<string>('');
  const [data, setData] = useState<string>('');
  const { sendEvent } = useChat();
  const input = part?.input as SendEventInput | undefined;

  const parsedData = useCallback((_data: string) => {
    try {
      return JSON.parse(_data);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setEvent(input?.event ?? '');
    setData(input?.data ?? '');

    const fetchFiles = async () => {
      if (input?.event !== 'files_preview') {
        setFiles([]);
        return;
      }

      const fileInfos: FileInfo[] = [];

      try {
        const parsed = JSON.parse(input.data ?? '{}') as { files?: string[] };

        for (const filePath of parsed.files ?? []) {
          const info = await window.electron.app.getFileInfo(filePath);
          if (info && info.isExist) {
            fileInfos.push(info);
          }
        }
      } catch {
        // Ignore malformed preview payloads and render no attachments.
      }

      setFiles(fileInfos);
    };

    fetchFiles();
  }, [input]);

  const { imageFiles, previewCardFiles, documentFiles } = useMemo(() => {
    const images: FileInfo[] = [];
    const previews: FileInfo[] = [];
    const documents: FileInfo[] = [];

    for (const file of files) {
      if (isImageFile(file)) {
        images.push(file);
      } else if (isPreviewCardFile(file)) {
        previews.push(file);
      } else {
        documents.push(file);
      }
    }

    return {
      imageFiles: images,
      previewCardFiles: previews,
      documentFiles: documents,
    };
  }, [files]);

  const renderPreviewCard = (file: FileInfo, i: number) => {
    if (
      file.mimeType?.startsWith('video/') &&
      file.ext?.toLowerCase() !== '.ts'
    ) {
      return (
        <div
          className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
          key={`${file.path}-${i}`}
        >
          <video
            src={toFileUrl(file.path)}
            controls
            className="max-h-[320px] w-full bg-black"
          >
            <track kind="captions" />
          </video>
        </div>
      );
    }

    if (file.mimeType?.startsWith('audio/')) {
      return (
        <div
          className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm"
          key={`${file.path}-${i}`}
        >
          <div className="mb-2 text-sm font-medium">{file.name}</div>
          <audio src={toFileUrl(file.path)} controls className="w-full">
            <track kind="captions" />
          </audio>
        </div>
      );
    }

    if (isSupportedModelFile(file.ext)) {
      return (
        <div
          className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
          key={`${file.path}-${i}`}
        >
          <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
            {file.name}
          </div>
          <ModelViewer
            url={toFileUrl(file.path)}
            ext={file.ext!}
            className="w-full"
            style={{ height: 260 }}
          />
        </div>
      );
    }

    return (
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
        key={`${file.path}-${i}`}
      >
        <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
          {file.name}
        </div>
        <iframe
          src={toFileUrl(file.path)}
          className="h-[420px] w-full bg-background"
          title={file.name}
        />
      </div>
    );
  };

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
              <span className="truncate block">
                {parsedData(data)?.url ?? '-'}
              </span>
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
      {event === 'files_preview' && (
        <div className="max-w-[min(100%,42rem)] space-y-3">
          {imageFiles.length > 0 && (
            <PhotoProvider>
              <div className="flex flex-wrap gap-2">
                {imageFiles.map((file, i) => (
                  <PhotoView
                    src={toFileUrl(file.path)}
                    key={`${file.path}-${i}`}
                  >
                    <div
                      className={cn(
                        'group relative overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm',
                        imageFiles.length === 1 ? 'max-w-[260px]' : 'size-32',
                      )}
                    >
                      <img
                        alt={file.name || 'attachment'}
                        className={cn(
                          'w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]',
                          imageFiles.length === 1
                            ? 'max-h-[260px]'
                            : 'size-full',
                        )}
                        height={imageFiles.length === 1 ? 260 : 128}
                        src={toFileUrl(file.path)}
                        width={imageFiles.length === 1 ? 260 : 128}
                      />
                      {file.name ? (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5">
                          <span className="block truncate text-[11px] text-white/90">
                            {file.name}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </PhotoView>
                ))}
              </div>
            </PhotoProvider>
          )}

          {previewCardFiles.length > 0 && (
            <div className="flex max-w-[560px] flex-col gap-2">
              {previewCardFiles.map(renderPreviewCard)}
            </div>
          )}

          {documentFiles.length > 0 && (
            <div className="flex max-w-[560px] flex-col gap-2">
              {documentFiles.map((file, i) => (
                <Item
                  key={`${file.path}-${i}`}
                  variant="outline"
                  className="w-full cursor-pointer items-start gap-3 rounded-2xl border-border/60 bg-secondary/60 p-3 transition-colors hover:bg-secondary"
                  onClick={() => {
                    window.electron.app.openPath(file.path);
                  }}
                >
                  <ItemMedia className="pt-0.5">
                    <FileIcon filePath={file.path} className="size-10" />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full truncate">
                      {file.name}
                    </ItemTitle>
                    <ItemDescription>
                      <span className="block truncate">{file.path}</span>
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
});
