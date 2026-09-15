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
import { Item, ItemContent, ItemDescription, ItemTitle } from '../../ui/item';
import { Card } from '../../ui/card';
import { FileIcon } from '../../file-icon';
import { FileInfo } from '@/types/common';
import { useChat } from '@/renderer/hooks/use-chat';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { ModelViewer, isSupportedModelFile } from '../../model-viewer';
import { cn } from '@/renderer/lib/utils';
import { splitContextAndFiles } from '@/utils/context-utils';
import { IconWorldWww } from '@tabler/icons-react';
import { Progress } from '../../ui/progress';
import { LocalFileActions } from './local-file-actions';
import { useIsCompactWindow } from '../chat-preview-visibility';
import { toFileUrl } from '../chat-filesystem/file-workspace-utils';
import { useTranslation } from 'react-i18next';
import { useThreadStore } from '@/renderer/store/use-thread-store';
import { isFileWithinDirectory } from '../chat-filesystem/file-preview-path';

type SendEventInput = {
  event?: string;
  data?: string;
};

export interface SendEventMessageRef {}

export type SendEventMessageProps = Omit<
  ComponentProps<typeof Card>,
  'part'
> & {
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
  const { t } = useTranslation();
  const isCompactWindow = useIsCompactWindow();
  const workspace = useThreadStore(
    (state) => state.threadStates[threadId]?.metadata?.workspace,
  );
  const canOpenInFilesystem = (file: FileInfo) =>
    Boolean(
      threadId &&
      sendEvent &&
      !isCompactWindow &&
      file.isFile !== false &&
      typeof workspace === 'string' &&
      file.path &&
      isFileWithinDirectory(file.path, workspace),
    );
  const openInFilesystem = (file: FileInfo) => {
    if (canOpenInFilesystem(file))
      sendEvent(threadId, 'file_preview', { filePath: file.path });
    else window.electron.app.openPath(file.path);
  };
  const renderFileActions = (file: FileInfo) => (
    <LocalFileActions
      fileName={file.name || file.path}
      onOpenInFilesystem={
        canOpenInFilesystem(file) ? () => openInFilesystem(file) : undefined
      }
      onShowInExplorer={() => window.electron.app.openPath(file.path)}
    />
  );
  const renderFileHeader = (file: FileInfo) => (
    <div className="flex min-w-0 items-center gap-1 border-b border-border/60 bg-card px-3 py-1.5">
      <button
        type="button"
        className="min-w-0 flex-1 truncate rounded-sm py-1 text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={file.path}
        onClick={() => openInFilesystem(file)}
      >
        {file.name}
      </button>
      {renderFileActions(file)}
    </div>
  );

  const parsedData = useCallback((_data: string) => {
    try {
      return JSON.parse(_data);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEvent(input?.event ?? '');
    setData(input?.data ?? '');

    const fetchFiles = async () => {
      if (!(input?.event === 'files_preview' || input?.event === 'speech')) {
        setFiles([]);
        return;
      }

      const fileInfos: FileInfo[] = [];

      try {
        const parsed = JSON.parse(input.data ?? '{}') as { files?: string[] };
        for (const filePath of parsed.files ?? []) {
          const info = await window.electron.app.getFileInfo(filePath);
          if (info?.isExist && info.path) {
            fileInfos.push(info);
          }
        }
        if (input.event === 'speech' && part?.output) {
          const infos = await splitContextAndFiles(
            (part?.output as string) ?? '',
          );
          fileInfos.push(...(infos?.attachments ?? []));
        }
      } catch {
        // Ignore malformed preview payloads and render no attachments.
      }

      if (!cancelled) setFiles(fileInfos);
    };

    fetchFiles();
    return () => {
      cancelled = true;
    };
  }, [input, part?.output]);

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
          {renderFileHeader(file)}
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
          className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
          key={`${file.path}-${i}`}
        >
          {renderFileHeader(file)}
          <audio
            src={toFileUrl(file.path)}
            controls
            className="my-3 w-full px-3"
          >
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
          {renderFileHeader(file)}
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
        {renderFileHeader(file)}
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
          className="w-full cursor-pointer bg-secondary p-2 gap-2 items-center"
          onClick={() => {
            sendEvent(threadId, 'web_preview', JSON.parse(data));
          }}
        >
          <ItemContent className="min-w-0">
            <ItemTitle>
              <IconWorldWww></IconWorldWww> Web Preview
            </ItemTitle>
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
                  <div
                    key={`${file.path}-${i}`}
                    className={cn(
                      'overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-sm',
                      imageFiles.length === 1 ? 'w-[260px] max-w-full' : 'w-40',
                    )}
                  >
                    <PhotoView src={toFileUrl(file.path)}>
                      <button
                        type="button"
                        aria-label={`${t('chat.preview_file')}: ${file.name}`}
                        className="group block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <img
                          alt={file.name || 'attachment'}
                          className={cn(
                            'w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]',
                            imageFiles.length === 1 ? 'max-h-[260px]' : 'h-32',
                          )}
                          src={toFileUrl(file.path)}
                        />
                      </button>
                    </PhotoView>
                    {renderFileHeader(file)}
                  </div>
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
                  className="w-full flex-nowrap items-center gap-1 rounded-2xl border-border/60 bg-secondary/60 p-1 transition-colors hover:bg-secondary"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={file.path}
                    onClick={() => openInFilesystem(file)}
                  >
                    <FileIcon
                      filePath={file.path}
                      className="size-10 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {file.name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {file.path}
                      </span>
                    </span>
                  </button>
                  {renderFileActions(file)}
                </Item>
              ))}
            </div>
          )}
        </div>
      )}
      {event === 'speech' && (
        <div className="max-w-[min(100%,42rem)] space-y-3">
          {previewCardFiles.length > 0 && (
            <div className="flex max-w-[560px] flex-col gap-2">
              {previewCardFiles.map(renderPreviewCard)}
            </div>
          )}
        </div>
      )}
      {event === 'progress' && parsedData(data)?.message && (
        <Progress
          value={Number(parsedData(data)?.percent ?? 0)}
          className="w-full max-w-sm"
        >
          {parsedData(data)?.message}
        </Progress>
      )}
    </>
  );
});
