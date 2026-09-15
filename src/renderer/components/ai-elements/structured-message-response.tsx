import { memo, useMemo } from 'react';
import type { UIMessage } from 'ai';
import { cn } from '@/renderer/lib/utils';
import { Streamdown, type StreamdownProps } from './streamdown';
import {
  isStructuredMessageXml,
  parseStructuredMessage,
} from './structured-message-parser';
import { StructuredMessage } from './structured-message';

export type StructuredMessageResponseProps = StreamdownProps & {
  messageRole?: UIMessage['role'];
};

export const StructuredMessageResponse = memo(
  ({
    children,
    className,
    messageRole,
    ...props
  }: StructuredMessageResponseProps) => {
    const data = useMemo(
      () =>
        messageRole === 'user' && typeof children === 'string'
          ? parseStructuredMessage(children)
          : null,
      [children, messageRole],
    );
    const classes = cn(
      'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
      className,
    );
    if (data) {
      return (
        <div className={classes}>
          <StructuredMessage data={data} />
        </div>
      );
    }
    // Preserve incomplete, malformed, or future-version messages as readable text.
    if (
      messageRole === 'user' &&
      typeof children === 'string' &&
      isStructuredMessageXml(children)
    ) {
      return (
        <pre className={cn(classes, 'whitespace-pre-wrap break-words')}>
          {children}
        </pre>
      );
    }
    return (
      <Streamdown className={classes} {...props}>
        {children}
      </Streamdown>
    );
  },
);
StructuredMessageResponse.displayName = 'StructuredMessageResponse';
