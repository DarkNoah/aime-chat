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
  MailCheckIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
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
import toast from 'react-hot-toast';
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
import {
  ChatChangedType,
  ChatEvent,
  ChatPreviewData,
  ChatPreviewType,
} from '@/types/chat';
import { ChatPreview } from '../components/chat-ui/chat-preview';
import { Label } from '../components/ui/label';
import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconArrowDown,
  IconArrowUp,
  IconInbox,
  IconSvg,
} from '@tabler/icons-react';
import domtoimage from 'dom-to-image';
import { useTheme } from 'next-themes';
import { ButtonGroup } from '../components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

function ChatPage() {
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
  const { setTitle, setTitleAction } = useHeader();
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
  const [previewData, setPreviewData] = useState<ChatPreviewData>({
    previewPanel: ChatPreviewType.CANVAS,
  });
  // const Excalidraw = lazy(() => import('@excalidraw/excalidraw'));

  // const [threadId, setThreadId] = useState<string | undefined>();
  const location = useLocation();
  const threadId = useMemo(
    () => location.pathname.split('/')[2],
    [location.pathname],
  );
  const [thread, setThread] = useState<StorageThreadType | undefined>();

  const prompts = [
    '介绍日食,请创建课程',
    '使用Bash查询当前时间',
    '创建一个web项目',
  ];

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
    onFinish: (event) => {
      if (event.isAbort) {
        const _messages = event.messages;
      }

      console.log('onFinish', event);
      // debugger;
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
  const handleSubmit = async (
    message: PromptInputMessage,
    // model?: string,
    options?: {
      model?: string;
      webSearch?: boolean;
      think?: boolean;
      tools?: string[];
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
      think: options?.think,
      requireToolApproval: options?.requireToolApproval,
      runId,
      threadId,
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
  const resetChat = () => {
    setMessages([]);
    clearError();
    setUsage(undefined);
    setPreviewToolPart(undefined);
    setShowPreview(false);
    setThread(undefined);
    chatInputRef.current?.setTools([]);
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

  useEffect(() => {
    resetChat();
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
          (_thread?.metadata?.model as string) ?? appInfo?.defaultModel?.model,
        );
        setUsage(
          _thread?.metadata as {
            usage: LanguageModelUsage;
            model: string;
            maxTokens: number;
          },
        );
        chatInputRef.current?.setTools(
          (_thread?.metadata?.tools as string[]) ?? [],
        );
        if (((_thread?.metadata?.todos as any[]) ?? []).length > 0) {
          setPreviewData((prev: ChatPreviewData) => ({
            ...prev,
            todos: _thread?.metadata?.todos as any[],
            previewPanel: ChatPreviewType.TODO,
          }));
        }

        setTitle(renderTitle());
      };
      getThread();
      const { message, options } = location.state || {};
      if (message) {
        location.state = null;
        handleSubmit(message, options);
      }

      const handleEvent = (event: { type: ChatEvent; data: any }) => {
        if (
          event.type === ChatEvent.ChatChanged &&
          event.data.type === ChatChangedType.TitleUpdated
        ) {
          setThread({ ...thread, title: event.data.title as string });
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
    return () => {};
  }, [threadId]);

  useEffect(() => {
    if (thread) {
      setTitle(renderTitle());
    }
  }, [thread?.title]);

  const handleExportConversation = async (mode: 'jpg' | 'svg') => {
    try {
      const bgcolor = appInfo.shouldUseDarkColors ? '#000000' : '#ffffff';
      let dataUrl = '';
      let blob;
      if (mode === 'jpg') {
        dataUrl = await domtoimage.toJpeg(
          document.querySelector('#chat-conversation'),
          {
            bgcolor,
          },
        );
        const byteCharacters = atob(
          dataUrl.substring(dataUrl.indexOf(',') + 1),
        ); // 解码 base64
        const byteNumbers = Array.from(byteCharacters).map((ch) =>
          ch.charCodeAt(0),
        );
        const byteArray = new Uint8Array(byteNumbers);
        const mimeType = 'image/jpeg';
        blob = new Blob([byteArray], { type: mimeType });
      } else if (mode === 'svg') {
        dataUrl = await domtoimage.toSvg(
          document.querySelector('#chat-conversation'),
          {
            bgcolor,
          },
        );
        blob = new Blob([dataUrl.substring(dataUrl.indexOf(',') + 1)], {
          type: 'image/svg+xml',
        });
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${thread?.title.replaceAll(' ', '_')}_${new Date().getTime()}.${mode}`;
      link.click();
      URL.revokeObjectURL(link.href); // 释放 URL
    } catch (err) {
      toast.error('Export image failed');
      console.error(err);
    }
  };

  useEffect(() => {
    setTitleAction(
      <div className="flex flex-row gap-2">
        {/* <Button
          variant="outline"
          onClick={() => {
            setPreviewData((prev: ChatPreviewData) => {
              return {
                ...prev,
                previewPanel: ChatPreviewType.WEB_PREVIEW,
                webPreviewUrl: 'https://www.baidu.com',
              };
            });
          }}
        >
          Open
        </Button> */}

        <ButtonGroup>
          <Button
            variant="outline"
            onClick={() => handleExportConversation('jpg')}
          >
            Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More Options">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => handleExportConversation('svg')}
                >
                  <IconSvg />
                  Export Svg
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowPreview(!showPreview)}
        >
          {!showPreview && <IconArrowBarLeft />}
          {showPreview && <IconArrowBarRight />}
        </Button>
      </div>,
    );
  }, [showPreview, setTitleAction, threadId]);

  const handleAbort = () => {
    stop();
  };

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full w-full @container"
    >
      <ResizablePanel className={`h-full  w-full justify-between `}>
        <div className="flex flex-col h-full">
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
                          } else if (part.type.startsWith('tool-')) {
                            const _part = part as ToolUIPart;
                            return (
                              <ToolMessage
                                key={`${message.id}-${i}`}
                                part={_part}
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
              {usage?.usage?.totalTokens && (
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
              onClearMessages={handleClearMessages}
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
          <ResizableHandle withHandle />
          <ResizablePanel
            maxSize={showPreview ? 75 : 0}
            className={`h-full flex-1 `}
          >
            <div className="p-2 w-full h-full">
              <ChatPreview
                part={previewToolPart}
                messages={messages}
                previewData={previewData}
                onPreviewDataChange={(value) => {
                  setPreviewData(value);
                }}
              />
            </div>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

export default ChatPage;
