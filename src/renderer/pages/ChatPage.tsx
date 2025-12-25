/* eslint-disable camelcase */
/* eslint-disable no-underscore-dangle */
/* eslint-disable react/no-array-index-key */
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useMemo,
  lazy,
  useCallback,
} from 'react';
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
// import { useChat } from '@ai-sdk/react';
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
import {
  ToolMessage,
  ToolMessageApproval,
} from '../components/chat-ui/tool-message';
import {
  ChatChangedType,
  ChatEvent,
  ChatPreviewData,
  ChatPreviewType,
  ChatSubmitOptions,
} from '@/types/chat';
import { ChatPreview } from '../components/chat-ui/chat-preview';
import { Label } from '../components/ui/label';
import {
  IconArrowBarLeft,
  IconArrowBarRight,
  IconArrowDown,
  IconArrowUp,
  IconFolder,
  IconFolderOpen,
  IconImageInPicture,
  IconInbox,
  IconPictureInPicture,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { ChatUsage } from '../components/chat-ui/chat-usage';
import type {
  ToolApproval,
  ToolSuspended,
} from '../components/chat-ui/tool-message/index';
import { ChatAgentSelector } from '../components/chat-ui/chat-agent-selector';
import { Agent } from '@/types/agent';
import { ChatPanel, ChatPanelRef } from '../components/chat-ui/chat-panel';
import { useChat, useThread } from '../hooks/use-chat';
import { useThreadStore } from '../store/use-thread-store';
import { useShallow } from 'zustand/react/shallow';

function ChatPage() {
  const { appInfo } = useGlobal();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const chatPanelRef = useRef<ChatPanelRef>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewToolPart, setPreviewToolPart] = useState<
    ToolUIPart | undefined
  >();

  const { setTitle, setTitleAction } = useHeader();
  const navigate = useNavigate();
  const [previewData, setPreviewData] = useState<ChatPreviewData>({
    previewPanel: ChatPreviewType.CANVAS,
  });
  const location = useLocation();
  const threadId = useMemo(
    () => location.pathname.split('/')[2],
    [location.pathname],
  );
  const { updateThreadState } = useThreadStore();
  const { ensureThread } = useChat();
  const threadState = useThreadStore(
    useShallow((s) => s.threadStates[threadId]),
  );

  const renderTitle = useCallback(() => {
    return (
      <div className="flex flex-row w-full gap-2 justify-between ">
        <Input
          className="border-none focus-visible:ring-0 shadow-none focus-visible:bg-secondary max-w-[200px]"
          size={12}
          maxLength={64}
          value={threadState?.title}
          onChange={(e) => {
            updateThreadState(threadId, {
              title: e.target.value,
            });
          }}
          onBlur={async () => {
            await window.electron.mastra.updateThread(threadState?.id, {
              title: threadState?.title || '',
            });
          }}
        />
      </div>
    );
  }, [threadState?.title]);

  const handleSubmit = async (
    message: PromptInputMessage,
    options?: ChatSubmitOptions,
  ) => {
    if (!options?.threadId) {
      const data = await window.electron.mastra.createThread(options);
      options.threadId = data.id;
      await ensureThread(data.id);
      navigate(`/chat/${data.id}`, {
        state: {
          message,
          options,
        },
      });
    } else {
      chatPanelRef?.current?.sendMessage(message, options);
    }
  };

  useEffect(() => {
    if (threadId) {
      const { message, options } = location.state || {};
      if (message) {
        location.state = null;
        chatPanelRef?.current?.sendMessage(message, options);
      }
    } else if (location.pathname === '/chat') {
      setTitle(t('chat.new_chat'));
    }
    return () => {};
  }, [threadId]);

  useEffect(() => {
    if (threadState?.title) {
      setTitle(renderTitle());
    }
  }, [renderTitle, setTitle, threadState?.title]);

  useEffect(() => {
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
        link.download = `${threadState?.title.replaceAll(' ', '_')}_${new Date().getTime()}.${mode}`;
        link.click();
        URL.revokeObjectURL(link.href); // 释放 URL
      } catch (err) {
        toast.error('Export image failed');
        console.error(err);
      }
    };

    setTitleAction(
      <div className="flex flex-row gap-2">
        {threadId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More Options"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    if (threadState?.metadata?.workspace) {
                      window.electron.app.openPath(
                        threadState?.metadata?.workspace as string,
                      );
                    }
                  }}
                >
                  <IconFolderOpen />
                  Open Dictionary
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator></DropdownMenuSeparator>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => handleExportConversation('jpg')}
                >
                  <IconImageInPicture />
                  Export Jpg
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExportConversation('svg')}
                >
                  <IconSvg />
                  Export Svg
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setShowPreview(!showPreview)}
        >
          {!showPreview && <IconArrowBarLeft />}
          {showPreview && <IconArrowBarRight />}
        </Button>
      </div>,
    );
  }, [
    showPreview,
    setTitleAction,
    threadId,
    appInfo.shouldUseDarkColors,
    threadState?.title,
    threadState?.metadata?.workspace,
  ]);

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full w-full @container"
    >
      <ResizablePanel className={`h-full  w-full justify-between `}>
        <ChatPanel
          ref={chatPanelRef}
          onSubmit={handleSubmit}
          threadId={threadId}
          onToolMessageClick={(_part) => {
            setShowPreview(true);
            setPreviewToolPart(_part);
            setPreviewData((data) => {
              return {
                ...data,
                previewPanel: ChatPreviewType.TOOL_RESULT,
              };
            });
          }}
        ></ChatPanel>
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
                threadId={threadId}
                part={previewToolPart}
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
