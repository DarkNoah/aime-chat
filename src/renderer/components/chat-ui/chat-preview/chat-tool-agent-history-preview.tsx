import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FileUIPart, ToolUIPart, UIMessage } from 'ai';
import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { getSubAgentThreadId } from '@/utils/subagent-thread';
import { cn } from '@/renderer/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '../../ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../../ai-elements/reasoning';
import { ToolMessage } from '../tool-message';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from '../chat-message-attachment';

export type ChatToolAgentHistoryPreviewProps = {
  toolCallId?: string;
  className?: string;
};

export function ChatToolAgentHistoryPreview({
  toolCallId,
  className,
}: ChatToolAgentHistoryPreviewProps) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [error, setError] = useState<Error>();
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const loadMessages = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!toolCallId) {
      setMessages([]);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const result = await window.electron.mastra.getThreadMessages({
        threadId: getSubAgentThreadId(toolCallId),
        perPage: false,
      });
      if (requestId === requestIdRef.current) {
        setMessages(result.messages ?? []);
      }
    } catch (cause) {
      if (requestId === requestIdRef.current) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [toolCallId]);

  useEffect(() => {
    void loadMessages();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadMessages]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Agent history</CardTitle>
        <Button
          aria-label="Refresh agent history"
          disabled={isLoading || !toolCallId}
          onClick={() => void loadMessages()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <RefreshCwIcon className={cn(isLoading && 'animate-spin')} />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Loading agent history...
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load agent history.</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {!isLoading && !error && messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No agent history found.
          </p>
        ) : null}

        {messages.map((message) => (
          <div className="flex flex-col gap-2" key={message.id}>
            {message.parts.map((part, index) => {
              if (part.type === 'text' && part.text.trim()) {
                return (
                  <Message from={message.role} key={`${message.id}-${index}`}>
                    <MessageContent>
                      <MessageResponse>{part.text}</MessageResponse>
                    </MessageContent>
                  </Message>
                );
              }

              if (part.type === 'reasoning' && part.text.trim()) {
                return (
                  <Reasoning
                    defaultOpen={false}
                    isStreaming={part.state === 'streaming'}
                    key={`${message.id}-${index}`}
                  >
                    <ReasoningTrigger />
                    <ReasoningContent>{part.text}</ReasoningContent>
                  </Reasoning>
                );
              }

              if (part.type.startsWith('tool-')) {
                return (
                  <ToolMessage
                    key={`${message.id}-${index}`}
                    part={part as ToolUIPart}
                  />
                );
              }

              return null;
            })}

            <ChatMessageAttachments
              className={message.role === 'user' ? 'ml-auto' : 'ml-0'}
            >
              {message.parts
                .filter((part): part is FileUIPart => part.type === 'file')
                .map((part, index) => (
                  <ChatMessageAttachment
                    data={part}
                    key={`${message.id}-file-${index}`}
                  />
                ))}
            </ChatMessageAttachments>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
