import React, { ForwardedRef, Fragment } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationProps,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '../ai-elements/sources';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../ai-elements/reasoning';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message';
import { MastraDBMessage } from '@mastra/core/agent/message-list';
import { CopyIcon, Loader, MessageSquareIcon } from 'lucide-react';
import { ChatStatus, ToolUIPart } from 'ai';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Label } from '../ui/label';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from './chat-message-attachment';
import { ToolMessage, ToolMessageApproval } from './tool-message';
import { IconArrowDown } from '@tabler/icons-react';
import { ChatPreviewData, ChatPreviewType } from '../../../types/chat';

export type ChatConversationProps = ConversationProps & {
  messages: MastraDBMessage[];
  error?: Error;
  status?: ChatStatus;
  onResumeChat?: (approved: boolean, runId: string, toolCallId: string) => void;
};

export interface ChatConversationRef {}

export const ChatConversation = React.forwardRef<
  ChatConversationRef,
  ChatConversationProps
>((props: ChatConversationProps, ref: ForwardedRef<ChatConversationRef>) => {
  const { messages, status, error, onResumeChat } = props;

  return (
    <Conversation className="h-full w-full flex-1 flex items-center justify-center overflow-y-hidden">
      <ConversationContent className="h-full" id="chat-conversation">
        {messages.length === 0 && (
          <ConversationEmptyState
            description="Messages will appear here as the conversation progresses."
            icon={<MessageSquareIcon className="size-6" />}
            title="Start a conversation"
            className="h-full"
          />
        )}

        {messages.length > 0 && (
          <div>
            {messages.map((message) => {
              return (
                <div key={message.id} className="flex flex-col gap-2">
                  {message.role === 'assistant' &&
                    message.content.parts.filter(
                      (part) => part.type === 'source',
                    ).length > 0 && (
                      <Sources key={message.id}>
                        <SourcesTrigger
                          count={
                            message.content.parts.filter(
                              (part) => part.type === 'source',
                            ).length
                          }
                        />
                        {message.content.parts
                          .filter((part) => part.type === 'source')
                          .map((part, i) => (
                            <SourcesContent key={`${message.id}-${i}`}>
                              <Source
                                key={`${message.id}-${i}`}
                                href={part.source.url}
                                title={part.source.title}
                              />
                            </SourcesContent>
                          ))}
                      </Sources>
                    )}
                  {message?.parts?.map((part, i) => {
                    if (part.type === 'reasoning' && part.text.trim())
                      return (
                        <Reasoning
                          key={`${message.id}-${i}`}
                          className="w-fit"
                          defaultOpen={false}
                          isStreaming={part.state === 'streaming'}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent className="whitespace-pre-wrap">
                            {part.text}
                          </ReasoningContent>
                        </Reasoning>
                      );
                    else if (part.type === 'text' && part.text.trim()) {
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>
                          </Message>
                          <MessageActions
                            className={
                              message.role === 'user'
                                ? 'justify-end'
                                : 'justify-start'
                            }
                          >
                            <MessageAction
                              onClick={() =>
                                navigator.clipboard.writeText(part.text)
                              }
                              label="Copy"
                            >
                              <CopyIcon className="size-3" />
                            </MessageAction>
                            {message?.parts.length === i + 1 &&
                              message.role === 'assistant' &&
                              message.metadata?.usage?.inputTokens &&
                              message.metadata?.usage?.outputTokens && (
                                <small className="text-xs text-gray-500 flex flex-row gap-1 items-center">
                                  <Label>tokens: </Label>
                                  {message.metadata?.usage?.inputTokens && (
                                    <span className="flex flex-row gap-1 items-center">
                                      <IconArrowUp size={10}></IconArrowUp>
                                      {message.metadata?.usage?.inputTokens}
                                    </span>
                                  )}

                                  {message.metadata?.usage?.outputTokens && (
                                    <span className="flex flex-row gap-1 items-center">
                                      <IconArrowDown size={10}></IconArrowDown>
                                      {message.metadata?.usage?.outputTokens}
                                    </span>
                                  )}
                                </small>
                              )}
                          </MessageActions>
                        </Fragment>
                      );
                    } else if (part.type.startsWith('tool-')) {
                      const _part = part as ToolUIPart;
                      const approval =
                        message?.metadata?.pendingToolApprovals?.[
                          _part?.toolCallId
                        ];
                      return (
                        <div className="flex flex-col">
                          <ToolMessage
                            key={`${message.id}-${i}`}
                            part={_part}
                            isApprovalRequested={
                              approval && approval.type === 'approval'
                            }
                            onClick={() => {
                              console.log(_part);
                              setShowPreview(true);
                              setPreviewToolPart(_part);
                              setPreviewData((data) => {
                                return {
                                  ...data,
                                  previewPanel: ChatPreviewType.TOOL_RESULT,
                                };
                              });
                            }}
                          ></ToolMessage>
                          {approval && (
                            <ToolMessageApproval
                              approval={approval}
                              onReject={() => {
                                console.log('reject', approval);
                                onResumeChat?.(
                                  false,
                                  approval.runId,
                                  _part?.toolCallId,
                                );
                              }}
                              onAccept={() => {
                                console.log('accept', approval);
                                onResumeChat?.(
                                  true,
                                  approval.runId,
                                  _part?.toolCallId,
                                );
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                  <ChatMessageAttachments
                    className={`mb-2 ${message.role === 'user' ? 'ml-auto' : 'ml-0'}`}
                  >
                    {message?.parts
                      ?.filter((p) => p.type === 'file')
                      .map((part, i) => {
                        return (
                          <ChatMessageAttachment
                            data={part}
                            key={`${message.id}-${i}`}
                          />
                        );
                      })}
                  </ChatMessageAttachments>
                </div>
              );
            })}
          </div>
        )}
        {status === 'submitted' && <Loader className="animate-spin" />}
        {error && (
          <Alert variant="destructive" className="bg-red-200 w-fit">
            <AlertTitle className="font-extrabold">Error</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
});
