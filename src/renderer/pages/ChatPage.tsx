/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable react/no-array-index-key */
import { Fragment, useEffect, useRef, useState, useMemo, lazy } from 'react';
import { AppSidebar } from '../components/app-sidebar';
import { ChatModelSelect } from '../components/chat-ui/chat-model-select';
import { Button } from '../components/ui/button';
import { motion } from 'framer-motion';
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar';
import {
  CircleStop,
  CopyIcon,
  HomeIcon,
  MessageSquareIcon,
} from 'lucide-react';
import { Suggestion, Suggestions } from '../components/ai-elements/suggestion';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { ChatInput, ChatInputRef } from '../components/chat-ui/chat-input';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../components/ai-elements/conversation';
import { Loader } from '../components/ai-elements/loader';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '../components/ai-elements/sources';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageAttachment,
  MessageAttachments,
  MessageContent,
  MessageResponse,
} from '../components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../components/ai-elements/reasoning';

import { Response } from '../components/ai-elements/response';
import { useChat } from '@ai-sdk/react';
import {
  ChatOnErrorCallback,
  DefaultChatTransport,
  LanguageModelUsage,
  ToolUIPart,
} from 'ai';
import { toast } from 'sonner';
import { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { Streamdown } from '../components/ai-elements/streamdown';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../components/ui/resizable';
import { useLocation, useNavigate } from 'react-router-dom';
import { StorageThreadType } from '@mastra/core/memory';
import { useHeader } from '../hooks/use-title';
import { useTranslation } from 'react-i18next';
import { Input } from '../components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetDescription,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '../components/ui/sheet';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '../components/ai-elements/tool';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { IpcChatTransport } from './chat/ipc-chat-transport';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from '../components/ai-elements/context';
import { useGlobal } from '../hooks/use-global';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from '../components/chat-ui/chat-message-attachment';
import { ToolMessage } from '../components/chat-ui/tool-message';
import { ChatEvent } from '@/types/chat';
import { ChatPreview } from '../components/chat-ui/chat-preview';
import { Label } from '../components/ui/label';
import { IconArrowDown, IconArrowUp, IconInbox } from '@tabler/icons-react';

function ChatPage() {
  const [input, setInput] = useState('');
  const { appInfo } = useGlobal();
  const { t } = useTranslation();
  const chatInputRef = useRef<ChatInputRef>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [runId, setRunId] = useState<string | undefined>();
  const { setTitle, setTitleAction } = useHeader();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<
    | {
        usage: LanguageModelUsage;
        modelId: string;
        maxTokens: number;
      }
    | undefined
  >();
  const [modelId, setModelId] = useState<string | undefined>();
  // const Excalidraw = lazy(() => import('@excalidraw/excalidraw'));

  // const [threadId, setThreadId] = useState<string | undefined>();
  const location = useLocation();
  const threadId = useMemo(
    () => location.pathname.split('/')[2],
    [location.pathname],
  );
  const [thread, setThread] = useState<StorageThreadType | undefined>();

  const prompts = ['介绍日食,请创建课程', '讲述黑洞的形成过程,请创建课程'];

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop,
    clearError,
  } = useChat({
    id: threadId,
    transport: new IpcChatTransport(),

    onFinish: (message) => {
      console.log(message);
      // debugger;
    },
    onData: (dataPart) => {
      console.log(dataPart);

      if (dataPart.type === 'data-workflow-step-suspended') {
        const { _runId } = dataPart.data as { runId: string };
        setRunId(_runId);
      }
      if (dataPart.type === 'data-usage') {
        setUsage(dataPart.data);
      }
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message);
      // clearError();
    },
  });

  const renderTitle = () => {
    return (
      <div className="flex flex-row w-full gap-2 justify-between ">
        <Input
          className="border-none focus-visible:ring-0 shadow-none focus-visible:bg-secondary max-w-[200px]"
          size={12}
          maxLength={64}
          value={thread?.title || ''}
          onChange={async (e) => {
            setThread({ ...thread, title: e.target.value });
          }}
          onBlur={async () => {
            await window.electron.mastra.updateThread(threadId, {
              title: thread?.title || '',
            });
          }}
        />
      </div>
    );
  };

  useEffect(() => {
    setMessages([]);
    clearError();
    setUsage(undefined);
    if (threadId) {
      const getThread = async () => {
        const _thread = await window.electron.mastra.getThread(threadId);
        console.log(_thread);
        setThread(_thread);
        if (_thread?.messages?.length > 0) {
          setMessages(_thread?.messages);
        }
        console.log(
          (_thread?.metadata?.modelId as string) ??
            appInfo?.defaultModel?.model,
        );

        setModelId(
          (_thread?.metadata?.modelId as string) ??
            appInfo?.defaultModel?.model,
        );
        setUsage(
          _thread?.metadata as {
            usage: LanguageModelUsage;
            modelId: string;
            maxTokens: number;
          },
        );
        setTitle(renderTitle());
      };
      getThread();
      const { message, options } = location.state || {};
      if (message) {
        location.state = null;
        sendMessage(message, options);
      }

      const handleEvent = (event: { type: ChatEvent; data: any }) => {
        if (event.type === ChatEvent.ChatTitleUpdated) {
          setThread({ ...thread, title: event.data as string });
          setTitle(renderTitle());
        }
      };
      window.electron.ipcRenderer.on(`chat:event:${threadId}`, handleEvent);
      return () => {
        window.electron.ipcRenderer.removeListener(
          `chat:event:${threadId}`,
          handleEvent,
        );
      };
    } else if (location.pathname === '/chat') {
      setTitle(t('chat.new_chat'));
      setModelId(appInfo?.defaultModel?.model);
    }
  }, [threadId]);

  useEffect(() => {
    if (thread) {
      setTitle(renderTitle());
    }
  }, [thread?.title]);

  useEffect(() => {
    setTitleAction(
      <div>
        <Button size="sm" onClick={() => setShowPreview(!showPreview)}>
          open
        </Button>
      </div>,
    );
  }, [showPreview, setTitleAction, threadId]);

  const handleSubmit = async (
    message: PromptInputMessage,
    model?: string,
    options?: { webSearch?: boolean; think?: boolean },
  ) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }
    if (!model) {
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

    if (!threadId) {
      const data = await window.electron.mastra.createThread();
      navigate(`/chat/${data.id}`, {
        state: {
          message: {
            text: message.text || 'Sent with attachments',
            files: message.files,
          },
          options: {
            body: {
              model,
              webSearch: options?.webSearch,
              think: options?.think,
              runId,
              threadId: data.id,
            },
          },
        },
      });
      return;
    }

    sendMessage(
      {
        text: message.text || 'Sent with attachments',
        files: message.files,
      },
      {
        body: {
          model,
          webSearch: options?.webSearch,
          runId,
          threadId: thread?.id,
        },
      },
    );
    setInput('');
    chatInputRef.current?.attachmentsClear();
  };

  const handleAbort = () => {
    stop();
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full w-full">
      <ResizablePanel className={`h-full  w-full justify-between `}>
        <div className={`flex flex-col h-full`}>
          <Conversation className="h-full w-full flex-1 flex items-center justify-center overflow-y-hidden">
            <ConversationContent className="h-full">
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
                        {message?.parts?.map((part, i) => {
                          if (part.type === 'reasoning' && part.text.trim())
                            return (
                              <Reasoning
                                key={`${message.id}-${i}`}
                                className="w-fit"
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
                                    <MessageResponse>
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
                                  <MessageAction
                                    onClick={() =>
                                      navigator.clipboard.writeText(part.text)
                                    }
                                    label="Copy"
                                  >
                                    <CopyIcon className="size-3" />
                                  </MessageAction>
                                  {message.metadata?.usage?.inputTokens &&
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
                          } else if (part.type.startsWith('tool-')) {
                            const _part = part as ToolUIPart;
                            return (
                              <ToolMessage
                                key={`${message.id}-${i}`}
                                part={_part}
                                onClick={() => {
                                  console.log(_part);
                                }}
                              ></ToolMessage>
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
              {usage?.usage && (
                <Context
                  maxTokens={usage?.maxTokens}
                  modelId={usage?.modelId}
                  usage={usage?.usage}
                  usedTokens={usage?.usage?.totalTokens}
                >
                  <ContextTrigger size="sm" />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody>
                      <ContextInputUsage />
                      <ContextOutputUsage />
                      <ContextReasoningUsage />
                      <ContextCacheUsage />
                    </ContextContentBody>
                    <ContextContentFooter />
                  </ContextContent>
                </Context>
              )}
            </div>

            <ChatInput
              showModelSelect
              showWebSearch
              showToolSelector
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
              prompts={prompts}
            ></ChatInput>
          </div>
        </div>
      </ResizablePanel>

      {showPreview && (
        <>
          <ResizableHandle />
          <ResizablePanel
            maxSize={showPreview ? 75 : 0}
            className={`h-full flex-1 `}
          >
            <div className="p-2 w-full h-full">
              <div className=" w-full h-full border rounded-2xl">
                <ChatPreview />
              </div>
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

export default ChatPage;
