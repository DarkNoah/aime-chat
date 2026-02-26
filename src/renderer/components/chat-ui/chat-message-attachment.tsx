import { FileUIPart } from 'ai';
import type { ComponentProps, HTMLAttributes, ReactElement } from 'react';
import { Button } from '../ui/button';
import { PaperclipIcon, XIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/renderer/lib/utils';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';

export type ChatMessageAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: FileUIPart;
  className?: string;
  onRemove?: () => void;
};

export function ChatMessageAttachment({
  data,
  className,
  onRemove,
  ...props
}: ChatMessageAttachmentProps) {
  const filename = data.filename || '';
  const mediaType =
    (data.mediaType?.startsWith('image/') ||
      data.mimeType?.startsWith('image/')) &&
    (data.url || data.data)
      ? 'image'
      : 'file';
  const isImage =
    data.mediaType?.startsWith('image/') || data.mimeType?.startsWith('image/');
  const isVideo =
    data.mediaType?.startsWith('video/') || data.mimeType?.startsWith('video/');
  const isAudio =
    data.mediaType?.startsWith('audio/') || data.mimeType?.startsWith('audio/');
  const attachmentLabel = filename || (isImage ? 'Image' : 'Attachment');

  if (isVideo) {
    return (
      <div
        className={cn(
          'group max-w-[300px] relative overflow-hidden rounded-lg',
          className,
        )}
        {...props}
      >
        <video src={data.url} controls>
          <track kind="captions" />
        </video>
      </div>
    );
  }
  if (isAudio) {
    return (
      <div
        className={cn(
          'group max-w-[300px] relative overflow-hidden rounded-lg',
          className,
        )}
        {...props}
      >
        <audio src={data.url} controls>
          <track kind="captions" />
        </audio>
      </div>
    );
  }
  if (isImage) {
    return (
      <div
        className={cn(
          'group relative size-30 overflow-hidden rounded-lg',
          className,
        )}
        {...props}
      >
        <PhotoView
          src={
            data.url ??
            `data:${data.mediaType || data.mimeType};base64,${data.data}`
          }
        >
          <img
            alt={filename || 'attachment'}
            className="size-full object-cover"
            height={100}
            src={
              data.url ??
              `data:${data.mediaType || data.mimeType};base64,${data.data}`
            }
            width={100}
          />
        </PhotoView>
        {onRemove && (
          <Button
            aria-label="Remove attachment"
            className="absolute top-2 right-2 size-6 rounded-full bg-background/80 p-0 opacity-0 backdrop-blur-sm transition-opacity hover:bg-background group-hover:opacity-100 [&>svg]:size-3"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            type="button"
            variant="ghost"
          >
            <XIcon />
            <span className="sr-only">Remove</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative size-30 overflow-hidden rounded-lg',
        className,
      )}
      {...props}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex size-full shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <PaperclipIcon className="size-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{attachmentLabel}</p>
        </TooltipContent>
      </Tooltip>
      {onRemove && (
        <Button
          aria-label="Remove attachment"
          className="size-6 shrink-0 rounded-full p-0 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 [&>svg]:size-3"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          type="button"
          variant="ghost"
        >
          <XIcon />
          <span className="sr-only">Remove</span>
        </Button>
      )}
    </div>
  );
}

export type ChatMessageAttachmentsProps = ComponentProps<'div'>;

export function ChatMessageAttachments({
  children,
  className,
  ...props
}: ChatMessageAttachmentsProps) {
  if (!children) {
    return null;
  }

  return (
    <PhotoProvider>
      <div
        className={cn(
          'ml-auto flex w-fit flex-wrap items-start gap-2',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </PhotoProvider>
  );
}
