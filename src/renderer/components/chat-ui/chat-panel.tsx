import { useGlobal } from '@/renderer/hooks/use-global';
import { useTheme } from 'next-themes';
import React, { Fragment, ReactNode, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatInput, ChatInputRef } from './chat-input';
import { LanguageModelUsage, ToolUIPart } from 'ai';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatPreviewData, ChatPreviewType } from '@/types/chat';
import { ChatPreview } from './chat-preview';
import { ChatUsage } from './chat-usage';
import { ChatAgentSelector } from './chat-agent-selector';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import { MessageSquareIcon } from 'lucide-react';
import { Agent } from '@/types/agent';
import toast from 'react-hot-toast';
import { useChat } from '@ai-sdk/react';
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
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
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
import { StorageThreadType } from '@mastra/core/memory';
import { cn } from '@/renderer/lib/utils';

function ChatPanelHeader() {
  return <div>ChatPanelHeader</div>;
}

export type ChatPanelProps = {
  children?: React.ReactNode;
  projectId?: string;
  threadId?: string;
  className?: string;
};

function ChatPanel(props: ChatPanelProps) {
  const { children, projectId, threadId, className } = props;

  const [input, setInput] = useState('');
  const { appInfo } = useGlobal();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const chatInputRef = useRef<ChatInputRef>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewToolPart, setPreviewToolPart] = useState<
    ToolUIPart | undefined
  >();
  const [runId, setRunId] = useState<string | undefined>();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<
    | {
        usage: LanguageModelUsage;
        model: string;
        maxTokens: number;
      }
    | undefined
  >();
  const [modelId, setModelId] = useState<string | undefined>();
  const [agentId, setAgentId] = useState<string | undefined>();
  const [previewData, setPreviewData] = useState<ChatPreviewData>({
    previewPanel: ChatPreviewType.CANVAS,
  });
  const location = useLocation();
  const [thread, setThread] = useState<StorageThreadType | undefined>();

  const {
    messages,
    setMessages,
    sendMessage,
    resumeStream,
    regenerate,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    id: threadId,
    transport: new IpcChatTransport(),
    onFinish: (event) => {
      if (event.isAbort) {
        const _messages = event.messages;
      }

      console.log('onFinish', event);
    },
    onData: (dataPart) => {
      console.log('onData', dataPart);

      if (dataPart.type === 'data-workflow-step-suspended') {
        const { runId: _runId } = dataPart.data as { runId: string };
        setRunId(_runId);
      }
      if (dataPart.type === 'data-usage') {
        setUsage(dataPart.data);
      }
      if (dataPart.type === 'data-send-event') {
        const { target_panel, data } = dataPart.data as {
          target_panel: string;
          data: any;
        };
        if (target_panel === 'web_preview' && data?.url) {
          setShowPreview(true);
          setPreviewData((prev: ChatPreviewData) => {
            return {
              ...prev,
              previewPanel: ChatPreviewType.WEB_PREVIEW,
              webPreviewUrl: data?.url,
            };
          });
        }
      }
    },
    onError: (err) => {
      console.error(err);
      toast.error(err.message);
      // clearError();
    },
  });

  const handleResumeChat = async (
    _runId: string,
    toolCallId: string,
    approved?: boolean,
    resumeData?: Record<string, any>,
  ) => {
    const body = {
      agentId,
      model: modelId,
      chatId: threadId,
      runId: _runId,
      threadId,
      approved,
      resumeData,
      tools: chatInputRef.current?.getTools(),
      toolCallId,
    };
    await sendMessage(undefined, { body });
  };

  const handleAbort = () => {
    stop();
  };

  const handleAgentChange = (_agent: Agent) => {
    chatInputRef.current?.setTools(_agent.tools || []);
    setAgentId(_agent?.id);
  };

  const handleClearMessages = async () => {
    if (threadId) {
      await window.electron.mastra.clearMessages(threadId);
      setMessages([]);
      clearError();
      setUsage(undefined);
      setPreviewToolPart(undefined);
      setShowPreview(false);
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
    clearError();

    for (const file of message.files || []) {
      const response = await fetch(file.url);
      const blob = await response.blob();
      file.url = (await blobToBase64(blob)) as string;
    }

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
    };
    const inputMessage = {
      text: message.text || 'Sent with attachments',
      files: message.files,
    };

    if (!threadId) {
      const data = await window.electron.mastra.createThread(options);
      body.threadId = data.id;
      navigate(`/chat/${data.id}`, {
        state: {
          message: inputMessage,
          options: body,
        },
      });
      return;
    }
    console.log(message, body);
    sendMessage(inputMessage, {
      body,
    });
    setInput('');
    chatInputRef.current?.attachmentsClear();
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
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
                      message.parts.filter((part) => part.type === 'source-url')
                        .length > 0 && (
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
                              {/* <MessageAction
                                    onClick={() =>
                                      navigator.clipboard.writeText(part.text)
                                    }
                                    label="Copy"
                                  >
                                    <CopyIcon className="size-3" />
                                  </MessageAction> */}
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
                                        <IconArrowDown
                                          size={10}
                                        ></IconArrowDown>
                                        {message.metadata?.usage?.outputTokens}
                                      </span>
                                    )}
                                  </small>
                                )}
                            </MessageActions>
                          </Fragment>
                        );
                      } else if (part.type.startsWith('tool-')) {
                        // eslint-disable-next-line no-underscore-dangle
                        const _part = part as ToolUIPart;
                        let approvalData: ToolApproval;
                        let suspendedData: ToolSuspended;
                        let isSuspended = false;
                        if (_part.state === 'input-available') {
                          approvalData =
                            message.parts.find(
                              (p) =>
                                p.type === 'data-tool-call-approval' &&
                                p.id === _part?.toolCallId,
                            )?.data ||
                            message?.metadata?.pendingToolApprovals?.[
                              _part?.toolCallId
                            ];

                          suspendedData =
                            message.parts.find(
                              (p) =>
                                p.type === 'data-tool-call-suspended' &&
                                p.id === _part?.toolCallId,
                            )?.data ||
                            message?.metadata?.suspendPayload?.[
                              _part?.toolCallId
                            ];

                          if (approvalData) {
                            approvalData.type = 'approval';
                            isSuspended = true;
                          }

                          if (suspendedData) {
                            suspendedData.type = 'suspended';
                            isSuspended = true;
                          }
                        }

                        return (
                          <div className="flex flex-col">
                            <ToolMessage
                              key={`${message.id}-${i}`}
                              part={_part}
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
      <div className="w-full px-4 pb-4 flex flex-col gap-2 justify-start">
        <div className="flex flex-row gap-2 justify-between">
          <ChatAgentSelector
            value={agentId}
            mode="single"
            onSelectedAgent={handleAgentChange}
          ></ChatAgentSelector>
          {usage?.usage?.totalTokens && (
            <ChatUsage
              value={{
                usage: usage?.usage,
                maxTokens: usage?.maxTokens,
                modelId: usage?.model,
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
          ref={chatInputRef}
          input={input}
          setInput={setInput}
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          status={status}
          className="flex-1 h-full"
        ></ChatInput>
      </div>
    </div>
  );
}

export default ChatPanel;
