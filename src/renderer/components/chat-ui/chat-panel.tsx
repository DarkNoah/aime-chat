/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
import { useGlobal } from '@/renderer/hooks/use-global';
import { useTheme } from 'next-themes';
import React, {
  ForwardedRef,
  Fragment,
  ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChatInput, ChatInputRef } from './chat-input';
import { LanguageModelUsage, ToolUIPart, UIMessage } from 'ai';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ChatChangedType,
  ChatEvent,
  ChatPreviewData,
  ChatPreviewType,
  ChatSubmitOptions,
  ThreadState,
} from '@/types/chat';
import { ChatPreview } from './chat-preview';
import { ChatUsage } from './chat-usage';
import { ChatAgentSelector } from './chat-agent-selector';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import { ChevronsUpDown, CopyIcon, MessageSquareIcon } from 'lucide-react';
import { Agent } from '@/types/agent';
import toast from 'react-hot-toast';
import { useChat as useAiSdkChat } from '@ai-sdk/react';
import { IpcChatTransport } from '@/renderer/pages/chat/ipc-chat-transport';
import { PromptInputMessage } from '../ai-elements/prompt-input';
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
import { IconAlertCircle, IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { Label } from '../ui/label';
import {
  ToolApproval,
  ToolMessage,
  ToolMessageApproval,
  ToolSuspended,
} from './tool-message';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from './chat-message-attachment';
import { Loader } from '../ai-elements/loader';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { cn } from '@/renderer/lib/utils';
// import { useThread } from '@/renderer/hooks/useChatStore';
import { nanoid } from '@/utils/nanoid';
import { useChat } from '@/renderer/hooks/use-chat';
import { useShallow } from 'zustand/react/shallow';
import { useThreadStore } from '@/renderer/store/use-thread-store';
import { eventBus } from '@/renderer/lib/event-bus';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';

export type ChatPanelProps = {
  children?: React.ReactNode;
  projectId?: string;
  threadId?: string;
  className?: string;
  onToolMessageClick?: (toolMessage: ToolUIPart) => void;
  onSubmit?: (message: PromptInputMessage, options?: ChatSubmitOptions) => void;
  onThreadChanged?: (thread: ThreadState) => void;
};
export interface ChatPanelRef {
  sendMessage: (
    message: PromptInputMessage,
    options?: ChatSubmitOptions,
  ) => void;
  setAgentId: (agentId: string) => void;
}

export const ChatPanel = React.forwardRef<ChatPanelRef, ChatPanelProps>(
  (props: ChatPanelProps, ref: ForwardedRef<ChatPanelRef>) => {
    const {
      children,
      projectId,
      threadId,
      className,
      onToolMessageClick,
      onSubmit,
      onThreadChanged,
    } = props;
    const threadState = useThreadStore(
      useShallow((s) => s.threadStates[threadId]),
    );
    const [compressing, setCompressing] = useState(false);

    const {
      ensureThread,
      unregisterThread,
      sendMessage,
      setMessages,
      stop,
      clearMessages,
      clearError,
    } = useChat();
    const [input, setInput] = useState('');
    const { appInfo } = useGlobal();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const chatInputRef = useRef<ChatInputRef>(null);
    const [runId, setRunId] = useState<string | undefined>();
    const [usage, setUsage] = useState<
      | {
          usage: LanguageModelUsage;
          model: string;
          modelId?: string;
          maxTokens: number;
        }
      | undefined
    >();
    const [agent, setAgent] = useState<Agent | undefined>();
    const [modelId, setModelId] = useState<string | undefined>();
    const [agentId, setAgentId] = useState<string | undefined>();
    const [requireToolApproval, setRequireToolApproval] = useState(false);
    const [suggestions, setSuggestions] = useState<string[] | undefined>();

    useImperativeHandle(ref, () => ({
      sendMessage: (
        message: PromptInputMessage | undefined,
        options?: ChatSubmitOptions,
      ) => {
        const inputMessage = message
          ? {
              text: message.text || 'Sent with attachments',
              files: message.files,
            }
          : undefined;
        const body = {
          model: options?.model,
          webSearch: options?.webSearch,
          tools: options?.tools,
          subAgents: options?.subAgents,
          think: options?.think,
          requireToolApproval: options?.requireToolApproval,
          runId,
          threadId,
          agentId,
          projectId,
        };
        sendMessage(threadId, inputMessage, body);
        setInput('');
        chatInputRef.current?.attachmentsClear();
      },
      setAgentId: (_agentId: string) => {
        setAgentId((prev) => {
          return _agentId;
        });
      },
    }));

    const handleResumeChat = async (
      _runId: string,
      toolCallId: string,
      approved?: boolean,
      resumeData?: Record<string, any>,
    ) => {
      const options: ChatSubmitOptions = {
        agentId,
        model: modelId,
        runId: _runId,
        projectId,
        threadId,
        approved,
        resumeData,
        tools: chatInputRef.current?.getTools(),
        toolCallId,
        requireToolApproval,
      };
      sendMessage(threadId, undefined, options);
    };

    const handleAbort = () => {
      stop(threadId);
    };

    const handleAgentChange = (_agent: Agent) => {
      const tools = _agent?.tools || [];
      tools.push(...(threadState?.metadata?.tools || []));
      chatInputRef.current?.setTools([...new Set(tools)]);
      setAgentId(_agent?.id);
      setAgent(_agent);
      if (_agent?.defaultModelId && !threadState?.metadata?.model) {
        setModelId(_agent?.defaultModelId);
      }
      if (_agent?.subAgents) {
        chatInputRef.current?.setSubAgents(_agent?.subAgents || []);
      }
      if (_agent?.suggestions) {
        setSuggestions(_agent?.suggestions || []);
      }
      if (
        _agent?.greeting &&
        (!threadState || threadState?.messages.length === 0)
      ) {
        if (threadId) {
          setMessages(threadId, [
            {
              id: nanoid(),
              role: 'assistant',
              parts: [{ type: 'text', text: _agent?.greeting }],
            },
          ]);
        }
      }
    };

    const handleClearMessages = async () => {
      if (threadId) {
        await clearMessages(threadId);
        // clearError(threadId);
        setUsage(undefined);
        // setPreviewToolPart(undefined);
        // setShowPreview(false);
      }
    };

    const handleSubmit = async (
      message: PromptInputMessage,
      // model?: string,
      options?: {
        model?: string;
        webSearch?: boolean;
        think?: boolean;
        tools?: string[];
        subAgents?: string[];
        requireToolApproval?: boolean;
      },
    ) => {
      const hasText = Boolean(message.text);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }
      if (!options?.model) {
        toast.error('Please select a model');
        return;
      }
      function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result); // result 是 base64 编码字符串
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      // clearError();

      for (const file of message.files || []) {
        const response = await fetch(file.url);
        const blob = await response.blob();
        file.url = (await blobToBase64(blob)) as string;
      }

      const body: ChatSubmitOptions = {
        model: options?.model,
        webSearch: options?.webSearch,
        tools: options?.tools,
        subAgents: options?.subAgents,
        think: options?.think,
        requireToolApproval: options?.requireToolApproval,
        runId,
        threadId,
        agentId,
        projectId,
      };
      const inputMessage = {
        text: message.text || 'Sent with attachments',
        files: message.files,
      };
      if (threadId) {
        console.log(inputMessage, body);
        sendMessage(threadId, inputMessage, body);
        setInput('');
        chatInputRef.current?.attachmentsClear();
      } else {
        onSubmit?.(inputMessage, body);
      }

      // if (!threadId) {
      //   return;
      // }
      // console.log(message, body);
      // sendMessage(inputMessage, {
      //   body,
      // });
      // setInput('');
      // chatInputRef.current?.attachmentsClear();
    };

    const resetChat = () => {
      // setMessages([]);
      // clearError(threadId);
      setUsage(undefined);
      setCompressing(false);
      // setThread(undefined);
      setAgentId(undefined);
      chatInputRef.current?.setTools([]);
      chatInputRef.current?.setSubAgents([]);
      chatInputRef.current?.setThink(true);
      setSuggestions(undefined);
      setRequireToolApproval(false);
    };

    useEffect(() => {
      resetChat();

      if (threadId) {
        eventBus.on(`chat:onData:${threadId}`, (event: any) => {
          console.log('chat:onData', event);
          if (event.type === 'data-compress-start') {
            setCompressing(true);
          } else if (event.type === 'data-compress-end') {
            setCompressing(false);
          } else if (event.type === 'data-usage') {
            setUsage(event.data);
          } else if (event.type === 'data-send-event') {
            const { target_panel, data } = event.data as {
              target_panel: string;
              data: any;
            };
            // if (target_panel === 'web_preview' && data?.url) {
            //   setShowPreview(true);
            //   setPreviewData((prev: ChatPreviewData) => {
            //     return {
            //       ...prev,
            //       previewPanel: ChatPreviewType.WEB_PREVIEW,
            //       webPreviewUrl: data?.url,
            //     };
            //   });
            // }
          }
        });
        eventBus.on(`chat:onFinish:${threadId}`, (event) => {
          console.log('chat:onFinish', event);
        });
        const getThread = async () => {
          // unregisterThread(threadId);
          const _thread = await ensureThread(threadId);
          // const _thread = await getThreadFn(threadId);
          console.log(_thread);
          onThreadChanged?.(_thread);

          setModelId(
            (_thread?.metadata?.model as string) ??
              appInfo?.defaultModel?.model,
          );
          setUsage(
            _thread?.metadata as {
              usage: LanguageModelUsage;
              model: string;
              modelId?: string;
              maxTokens: number;
            },
          );
          chatInputRef.current?.setThink(
            (_thread?.metadata?.think as boolean) ?? false,
          );

          chatInputRef.current?.setTools(
            (_thread?.metadata?.tools as string[]) ?? [],
          );
          chatInputRef.current?.setSubAgents(
            (_thread?.metadata?.subAgents as string[]) ?? [],
          );
          setRequireToolApproval(
            (_thread?.metadata?.requireToolApproval as boolean) ?? false,
          );
          setAgentId(_thread?.metadata?.agentId as string);
        };
        getThread();
        return () => {
          unregisterThread(threadId);
          eventBus.off(`chat:onData:${threadId}`);
          eventBus.off(`chat:onFinish:${threadId}`);
        };
      } else {
        setModelId(appInfo?.defaultModel?.model);
      }
      return () => {};
    }, [threadId]);

    return (
      <div className={cn('flex flex-col h-full', className)}>
        <Conversation className="h-full w-full flex-1 flex items-center justify-center overflow-y-hidden">
          <ConversationContent className="h-full" id="chat-conversation">
            {!threadState && agent?.greeting && (
              <div className="flex flex-col gap-2">
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse
                      className="text-xs"
                      mermaidConfig={{
                        theme: theme === 'dark' ? 'dark' : 'forest',
                      }}
                    >
                      {agent?.greeting}
                    </MessageResponse>
                  </MessageContent>
                </Message>
              </div>
            )}
            {!threadState && threadState?.messages.length === 0 && (
              <ConversationEmptyState
                description="Messages will appear here as the conversation progresses."
                icon={<MessageSquareIcon className="size-6" />}
                title="Start a conversation"
                className="h-full"
              />
            )}

            {threadState?.messages.length > 0 && (
              <div className="mt-6">
                {/* <pre className="text-xs whitespace-pre-wrap break-all bg-secondary p-2 rounded-2xl">
                  {JSON.stringify(threadState?.messages, null, 2)}
                </pre> */}
                {threadState?.messages.map((message) => {
                  return (
                    <div key={message.id} className="flex flex-col gap-2">
                      {message.role === 'assistant' &&
                        message.parts.filter(
                          (part) => part.type === 'source-url',
                        ).length > 0 && (
                          <Sources key={message.id}>
                            <SourcesTrigger
                              count={
                                message.parts.filter(
                                  (part) => part.type === 'source-url',
                                ).length
                              }
                            />
                            {message.parts
                              .filter((part) => part.type === 'source-url')
                              .map((part, i) => (
                                <SourcesContent key={`${message.id}-${i}`}>
                                  <Source
                                    key={`${message.id}-${i}`}
                                    href={part.url}
                                    title={part.url}
                                  />
                                </SourcesContent>
                              ))}
                          </Sources>
                        )}
                      {(message.metadata as any)?.compressed === true && <></>}
                      {!(message.metadata as any)?.compressed &&
                        message?.parts?.map((part, i) => {
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
                            if (
                              part.text.trim() ===
                              '[Request interrupted by user]'
                            ) {
                              return (
                                <Alert className="w-fit bg-muted p-2">
                                  <AlertTitle className="text-xs flex gap-1 items-center">
                                    <IconAlertCircle size={16}></IconAlertCircle>{t('common.request_interrupted_by_user')}
                                  </AlertTitle>
                                </Alert>
                              );
                            } else {
                              return (
                                <Fragment key={`${message.id}-${i}`}>
                                  <Message from={message.role}>
                                    <MessageContent>
                                      <MessageResponse
                                        className={`text-xs ${message.role === 'user' ? 'whitespace-break-spaces' : ''}`}
                                        mermaidConfig={{
                                          theme:
                                            theme === 'dark'
                                              ? 'dark'
                                              : 'forest',
                                        }}
                                      >
                                        {part.text}
                                      </MessageResponse>
                                    </MessageContent>
                                  </Message>

                                  <MessageActions
                                    className={
                                      message.role === 'user'
                                        ? 'justify-end'
                                        : 'justify-start'
                                    }
                                  >
                                    {message.role === 'user' && (
                                      <MessageAction
                                        onClick={() =>
                                          navigator.clipboard.writeText(
                                            part.text,
                                          )
                                        }
                                        label="Copy"
                                      >
                                        <CopyIcon className="size-3" />
                                      </MessageAction>
                                    )}

                                    {message?.parts.length === i + 1 &&
                                      message.role === 'assistant' &&
                                      message.metadata?.usage?.inputTokens &&
                                      message.metadata?.usage?.outputTokens && (
                                        <small className="text-xs text-gray-500 flex flex-row gap-1 items-center">
                                          <Label>tokens: </Label>
                                          {message.metadata?.usage
                                            ?.inputTokens && (
                                            <span className="flex flex-row gap-1 items-center">
                                              <IconArrowUp
                                                size={10}
                                              ></IconArrowUp>
                                              {
                                                message.metadata?.usage
                                                  ?.inputTokens
                                              }
                                            </span>
                                          )}

                                          {message.metadata?.usage
                                            ?.outputTokens && (
                                            <span className="flex flex-row gap-1 items-center">
                                              <IconArrowDown
                                                size={10}
                                              ></IconArrowDown>
                                              {
                                                message.metadata?.usage
                                                  ?.outputTokens
                                              }
                                            </span>
                                          )}
                                        </small>
                                      )}
                                  </MessageActions>
                                </Fragment>
                              );
                            }
                          } else if (part.type.startsWith('tool-')) {
                            // eslint-disable-next-line no-underscore-dangle
                            const _part = part as ToolUIPart;
                            let approvalData: ToolApproval;
                            let suspendedData: ToolSuspended;
                            let isSuspended = false;
                            const metadata = message?.metadata as any;
                            if (_part.state === 'input-available') {
                              const pendingToolApproval =
                                metadata?.pendingToolApprovals?.[
                                  _part.type.substring('tool-'.length)
                                ];
                              const suspendedTool =
                                metadata?.suspendedTools?.[
                                  _part.type.substring('tool-'.length)
                                ];
                              approvalData = message.parts.find(
                                (p) =>
                                  p.type === 'data-tool-call-approval' &&
                                  p.id === _part?.toolCallId,
                              )?.data;
                              if (
                                !approvalData &&
                                pendingToolApproval &&
                                pendingToolApproval.toolCallId ===
                                  _part?.toolCallId
                              ) {
                                approvalData = pendingToolApproval;
                              }

                              suspendedData = message.parts.find(
                                (p) =>
                                  p.type === 'data-tool-call-suspended' &&
                                  p.id === _part?.toolCallId,
                              )?.data;

                              if (
                                !suspendedData &&
                                suspendedTool &&
                                suspendedTool.toolCallId === _part?.toolCallId
                              ) {
                                suspendedData = suspendedTool;
                              }

                              if (approvalData) {
                                approvalData.type = 'approval';
                                isSuspended = true;
                              }

                              if (suspendedData) {
                                // suspendedData.type = 'suspension';
                                isSuspended = true;
                              }
                            }

                            return (
                              <div className="flex flex-col">
                                <ToolMessage
                                  key={`${message.id}-${i}`}
                                  part={_part}
                                  threadId={threadId}
                                  isSuspended={isSuspended}
                                  onResume={(value) => {
                                    console.log(value);
                                    handleResumeChat(
                                      suspendedData.runId,
                                      _part?.toolCallId,
                                      undefined,
                                      value,
                                    );
                                  }}
                                  suspendedData={suspendedData}
                                  onClick={() => {
                                    console.log(_part);
                                    onToolMessageClick?.(_part);
                                  }}
                                ></ToolMessage>

                                {approvalData && (
                                  <ToolMessageApproval
                                    approval={approvalData}
                                    onReject={() => {
                                      console.log('reject', approvalData);
                                      handleResumeChat(
                                        approvalData.runId,
                                        _part?.toolCallId,
                                        false,
                                      );
                                    }}
                                    onAccept={() => {
                                      console.log('accept', approvalData);
                                      handleResumeChat(
                                        approvalData.runId,
                                        _part?.toolCallId,
                                        true,
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
            {threadState?.status === 'submitted' && (
              <Loader className="animate-spin" />
            )}
            {compressing && (
              <div className="flex flex-row gap-2 items-center">
                <Loader className="animate-spin" />{' '}
                <span className="text-xs">{t('common.compressing')}</span>
              </div>
            )}
            {threadState?.error && (
              <Alert variant="destructive" className="bg-red-200 w-fit">
                <AlertTitle className="font-extrabold">Error</AlertTitle>
                <AlertDescription>
                  {threadState?.error.message}
                </AlertDescription>
              </Alert>
            )}
            {threadState?.messages.length > 0 && <div className="pb-20"></div>}
          </ConversationContent>
          <ConversationScrollButton className="z-10 backdrop-blur" />
        </Conversation>
        <div className="w-full px-4 pb-4 flex flex-col gap-2 justify-start relative">
          <div className="flex flex-row gap-2 justify-between absolute w-full left-0 -top-10 px-4 h-8">
            <ChatAgentSelector
              value={agentId}
              mode="single"
              onSelectedAgent={handleAgentChange}
              clearable
            ></ChatAgentSelector>

            {usage?.usage?.totalTokens > 0 && (
              <ChatUsage
                value={{
                  usage: usage?.usage,
                  maxTokens: usage?.maxTokens,
                  modelId: usage?.modelId ?? usage?.model,
                }}
              />
            )}
          </div>
          <ChatInput
            onClearMessages={handleClearMessages}
            showModelSelect
            showWebSearch
            showToolSelector
            showAgentSelector
            showThink
            model={modelId}
            onModelChange={setModelId}
            requireToolApproval={requireToolApproval}
            onRequireToolApprovalChange={setRequireToolApproval}
            ref={chatInputRef}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            status={threadState?.status}
            className="flex-1 h-full"
          ></ChatInput>
        </div>
      </div>
    );
  },
);
