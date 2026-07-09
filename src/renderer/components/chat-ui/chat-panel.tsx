/* eslint-disable no-await-in-loop */
/* eslint-disable no-underscore-dangle */
import { useGlobal } from '@/renderer/hooks/use-global';
import { useTheme } from 'next-themes';
import React, {
  ForwardedRef,
  Fragment,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  GoalConfig,
} from '@/types/chat';
import { ChatPreview } from './chat-preview';
import { ChatUsage } from './chat-usage';
import { ChatAgentSelector } from './chat-agent-selector';
import { ChatGoalBanner } from './chat-goal-banner';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  ChevronsUpDown,
  ClockIcon,
  CopyIcon,
  MessageSquareIcon,
  SendIcon,
  XIcon,
} from 'lucide-react';
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
import {
  IconAlertCircle,
  IconArrowDown,
  IconArrowUp,
} from '@tabler/icons-react';
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
import {
  parseChatMessageAttachment,
  toChatMessageAttachmentPart,
} from './chat-message-attachment-parser';
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
import { ChatEmpty, TemplateItem } from './chat-empty';

type ChatMessageItemProps = {
  message: UIMessage;
  isLastMessage: boolean;
  expanded: boolean;
  theme: string | undefined;
  threadId?: string;
  interruptedLabel: string;
  onExpandedChange: (messageId: string, open: boolean) => void;
  onResumeChat: (
    runId: string,
    toolCallId: string,
    approved?: boolean,
    resumeData?: Record<string, any>,
  ) => void;
  onToolMessageClick?: (toolMessage: ToolUIPart) => void;
};

type PendingChatSubmit = {
  id: string;
  message: PromptInputMessage;
  uiMessage: UIMessage;
  options: ChatSubmitOptions;
  createdAt: number;
  immediate?: boolean;
};

const isRenderableMessagePart = (part: any) =>
  part.type === 'text' || part.type.startsWith('tool-');

const ChatMessageItem = React.memo(
  ({
    message,
    isLastMessage,
    expanded,
    theme,
    threadId,
    interruptedLabel,
    onExpandedChange,
    onResumeChat,
    onToolMessageClick,
  }: ChatMessageItemProps) => {
    let canExpandParts = [];
    let lastParts = [];

    if (message.role === 'user' || isLastMessage) {
      lastParts = message.parts;
    } else {
      for (let i = message.parts.length - 1; i >= 0; i -= 1) {
        if (isRenderableMessagePart(message.parts[i])) {
          lastParts = message.parts.slice(i);
          canExpandParts = message.parts.slice(0, i);
          break;
        }
      }
    }

    if (
      !(
        canExpandParts.find(isRenderableMessagePart) ||
        lastParts.find(isRenderableMessagePart)
      )
    ) {
      return null;
    }

    const renderPart = (part, i) => {
      if (part.type === 'reasoning' && part.text.trim()) {
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
      }

      if (
        part.type === 'text' &&
        part.text.trim() &&
        !part.text.trim().startsWith('<system-reminder>')
      ) {
        if (part.text.trim() === '[Request interrupted by user]') {
          return (
            <Alert className="w-fit bg-muted p-2" key={`${message.id}-${i}`}>
              <AlertTitle className="text-xs flex gap-1 items-center">
                <IconAlertCircle size={16}></IconAlertCircle>
                {interruptedLabel}
              </AlertTitle>
            </Alert>
          );
        }

        const parsedAttachment = parseChatMessageAttachment(part.text);
        if (parsedAttachment) {
          if (
            parsedAttachment?.mimeType?.startsWith('image/') ||
            parsedAttachment?.mimeType?.startsWith('audio/') ||
            parsedAttachment?.mimeType?.startsWith('video/')
          ) {
            return null;
          }
          return (
            <ChatMessageAttachments
              className={`mb-2 ${message.role === 'user' ? 'ml-auto' : 'ml-0'}`}
              key={`${message.id}-${i}`}
            >
              <ChatMessageAttachment
                data={toChatMessageAttachmentPart(parsedAttachment)}
              />
            </ChatMessageAttachments>
          );
        }

        if (part.text.trim() === '</attachment>') {
          return null;
        }

        return (
          <Fragment key={`${message.id}-${i}`}>
            <Message from={message.role}>
              <MessageContent>
                <MessageResponse
                  className={`text-xs wrap-break-word ${message.role === 'user' ? 'whitespace-break-spaces' : ''}`}
                  mermaidConfig={{
                    theme: theme === 'dark' ? 'dark' : 'forest',
                  }}
                >
                  {part.text}
                </MessageResponse>
              </MessageContent>
            </Message>

            <MessageActions
              className={
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }
            >
              {message.role === 'user' && (
                <MessageAction
                  onClick={() => navigator.clipboard.writeText(part.text)}
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
      }

      if (part.type.startsWith('tool-')) {
        const _part = part as ToolUIPart;
        let approvalData: ToolApproval | undefined;
        let suspendedData: ToolSuspended | undefined;
        let isSuspended = false;
        const metadata = message?.metadata as any;

        if (_part.state === 'input-available') {
          const pendingToolApproval =
            metadata?.pendingToolApprovals?.[
            _part.type.substring('tool-'.length)
            ];
          const suspendedTool =
            metadata?.suspendedTools?.[_part.type.substring('tool-'.length)];

          approvalData = message.parts.find(
            (p) =>
              p.type === 'data-tool-call-approval' &&
              p.id === _part?.toolCallId,
          )?.data;
          if (
            !approvalData &&
            pendingToolApproval &&
            pendingToolApproval.toolCallId === _part?.toolCallId
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
            isSuspended = true;
          }
        }

        return (
          <div className="flex flex-col" key={`${message.id}-${i}`}>
            <ToolMessage
              part={_part}
              threadId={threadId}
              isSuspended={isSuspended}
              onResume={(value) => {
                if (suspendedData?.runId) {
                  onResumeChat(
                    suspendedData.runId,
                    _part?.toolCallId,
                    undefined,
                    value,
                  );
                }
              }}
              suspendedData={suspendedData}
              onClick={() => {
                onToolMessageClick?.(_part);
              }}
            ></ToolMessage>

            {approvalData && (
              <ToolMessageApproval
                approval={approvalData}
                onReject={() => {
                  onResumeChat(approvalData.runId, _part?.toolCallId, false);
                }}
                onAccept={() => {
                  onResumeChat(approvalData.runId, _part?.toolCallId, true);
                }}
              />
            )}
          </div>
        );
      }

      return null;
    };

    const expandablePartCount = canExpandParts.filter(
      isRenderableMessagePart,
    ).length;

    return (
      <Collapsible
        open={expanded}
        onOpenChange={(open) => onExpandedChange(message.id, open)}
        className="flex flex-col gap-2 mt-2"
      >
        {message.role === 'assistant' && expandablePartCount > 0 && (
          <div className="flex items-center gap-4">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="flex flex-row gap-2 items-center"
              >
                <span className="text-sm font-semibold">{`${expanded ? 'Hide' : 'Show'} more details ${expandablePartCount} msg.`}</span>
                <ChevronsUpDown />
              </Button>
            </CollapsibleTrigger>
          </div>
        )}

        <CollapsibleContent className="flex flex-col gap-2">
          {!(message.metadata as any)?.compressed &&
            canExpandParts?.map((part, i) => renderPart(part, i))}
        </CollapsibleContent>
        {lastParts.map((part, i) => renderPart(part, i))}
        <ChatMessageAttachments
          className={`mb-2 ${message.role === 'user' ? 'ml-auto' : 'ml-0'}`}
        >
          {lastParts
            ?.filter((p) => p.type === 'file')
            .map((part, i) => {
              return (
                <ChatMessageAttachment data={part} key={`${message.id}-${i}`} />
              );
            })}
        </ChatMessageAttachments>
      </Collapsible>
    );
  },
  (prev, next) =>
    prev.message === next.message &&
    prev.isLastMessage === next.isLastMessage &&
    prev.expanded === next.expanded &&
    prev.theme === next.theme &&
    prev.threadId === next.threadId &&
    prev.interruptedLabel === next.interruptedLabel &&
    prev.onToolMessageClick === next.onToolMessageClick &&
    prev.onResumeChat === next.onResumeChat &&
    prev.onExpandedChange === next.onExpandedChange,
);

ChatMessageItem.displayName = 'ChatMessageItem';

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
    const updateThreadState = useThreadStore((s) => s.updateThreadState);
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
    const [historyMessages, setHistoryMessages] = useState<UIMessage[]>([]);
    const [expandedMessages, setExpandedMessages] = useState<string[]>([]);
    const [pendingSubmits, setPendingSubmits] = useState<PendingChatSubmit[]>(
      [],
    );
    const pendingSubmitsRef = useRef<PendingChatSubmit[]>([]);
    const [fetching, setFetching] = useState(false);

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
        chatInputRef.current?.attachmentsClear();
      },
      setAgentId: (_agentId: string) => {
        setAgentId((prev) => {
          return _agentId;
        });
      },
    }));

    const handleResumeChat = useCallback(
      async (
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
      },
      [agentId, modelId, projectId, requireToolApproval, sendMessage, threadId],
    );

    const handleAbort = () => {
      stop(threadId);
    };

    const handleAgentChange = async (_agent: Agent) => {
      console.log('AgentChange', _agent);
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
      } else {
        chatInputRef.current?.setSubAgents([]);
      }
      setSuggestions(_agent?.suggestions || []);

      if (threadId && threadState) {
        if (_agent?.id !== threadState?.metadata?.agentId) {
          console.log(_agent?.id, threadState);
          await window.electron.mastra.updateThread(threadId, {
            title: threadState?.title,
            metadata: {
              ...threadState?.metadata,
              agentId: _agent?.id,
              tools,
            },
          });
        }
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

    const handleModelChanged = async (_modelId: string) => {
      console.log('AgentChange', _modelId);
      setModelId(_modelId);
      if (threadId && threadState) {
        await window.electron.mastra.updateThread(threadId, {
          title: threadState?.title,
          metadata: {
            ...threadState?.metadata,
            model: _modelId,
          },
        });
      }
    };
    const handleGoalChanged = async (_goal: GoalConfig) => {
      if (threadId && threadState) {
        await window.electron.mastra.updateThread(threadId, {
          title: threadState?.title,
          metadata: {
            ...threadState?.metadata,
            goal: _goal,
          },
        });
        updateThreadState(threadId, {
          metadata: {
            ...threadState?.metadata,
            goal: _goal,
          },
        });
      }
      chatInputRef.current?.setGoal(_goal);
    };

    const syncPendingSubmits = useCallback((items: PendingChatSubmit[]) => {
      pendingSubmitsRef.current = items;
      setPendingSubmits(items);
    }, []);

    const buildPendingUIMessage = useCallback(
      (id: string, message: PromptInputMessage): UIMessage =>
        ({
          id,
          role: 'user',
          parts: [
            ...(message.files ?? []),
            ...(message.text ? [{ type: 'text', text: message.text }] : []),
          ],
          metadata: {
            pendingMessageId: id,
          },
        }) as UIMessage,
      [],
    );

    const enqueuePendingSubmit = useCallback(
      async (message: PromptInputMessage, options: ChatSubmitOptions) => {
        if (!threadId) {
          return;
        }

        const id = nanoid();
        const uiMessage = buildPendingUIMessage(id, message);
        const pending: PendingChatSubmit = {
          id,
          message,
          uiMessage,
          options,
          createdAt: Date.now(),
        };
        syncPendingSubmits([...pendingSubmitsRef.current, pending]);
        try {
          await window.electron.mastra.enqueuePendingMessage({
            id,
            chatId: threadId,
            message: uiMessage,
            options,
          });
        } catch (err) {
          syncPendingSubmits(
            pendingSubmitsRef.current.filter((item) => item.id !== id),
          );
          toast.error(err instanceof Error ? err.message : String(err));
        }
      },
      [buildPendingUIMessage, syncPendingSubmits, threadId],
    );

    const removePendingSubmit = useCallback(
      (id: string) => {
        syncPendingSubmits(
          pendingSubmitsRef.current.filter((item) => item.id !== id),
        );
        if (threadId) {
          window.electron.mastra.removePendingMessage(threadId, id);
        }
      },
      [syncPendingSubmits, threadId],
    );

    const submitPendingImmediately = useCallback(
      async (id: string) => {
        if (!threadId) {
          return;
        }

        const item = pendingSubmitsRef.current.find(
          (pending) => pending.id === id,
        );
        if (!item) {
          return;
        }

        const status = useThreadStore.getState().threadStates[threadId]?.status;
        if (status === 'streaming' || status === 'submitted') {
          syncPendingSubmits(
            pendingSubmitsRef.current.map((pending) =>
              pending.id === id ? { ...pending, immediate: true } : pending,
            ),
          );
          await window.electron.mastra.enqueuePendingMessage({
            id,
            chatId: threadId,
            message: item.uiMessage,
            options: item.options,
            immediate: true,
          });
          return;
        }

        syncPendingSubmits(
          pendingSubmitsRef.current.filter((pending) => pending.id !== id),
        );
        await window.electron.mastra.removePendingMessage(threadId, id);
        sendMessage(threadId, item.message, item.options);
      },
      [sendMessage, syncPendingSubmits, threadId],
    );

    const handleSubmit = async (
      message: PromptInputMessage,
      // model?: string,
      options?: {
        model?: string;
        webSearch?: boolean;
        think?: boolean;
        goal?: GoalConfig;
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
        goal: options?.goal,
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
        if (
          threadState?.status === 'streaming' ||
          threadState?.status === 'submitted'
        ) {
          await enqueuePendingSubmit(inputMessage, body);
        } else {
          sendMessage(threadId, inputMessage, body);
        }
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
      chatInputRef.current?.setGoal({
        enable: false,
        objective: '',
        status: null,
      });
      setSuggestions(undefined);
      setRequireToolApproval(false);
      setHistoryMessages([]);
      syncPendingSubmits([]);
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

    useEffect(() => {
      setFetching(true);
      resetChat();
      if (threadId) {
        const getThread = async () => {
          // unregisterThread(threadId);
          const _thread = await ensureThread(threadId);
          // const _thread = await getThreadFn(threadId);
          console.log('getThread', _thread);
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
          chatInputRef.current?.setGoal(
            (_thread?.metadata?.goal as GoalConfig) ?? {
              enable: false,
              objective: '',
              status: null,
            },
          );
          let _agent: Agent | undefined;
          if (_thread?.metadata?.agentId) {
            _agent = await window.electron.agents.getAgent(
              _thread?.metadata?.agentId as string,
            );
          }

          if (!_thread?.metadata?.tools) {
            chatInputRef.current?.setTools((_agent?.tools as string[]) ?? []);
          }
          if (!_thread?.metadata?.subAgents) {
            chatInputRef.current?.setSubAgents(
              (_agent?.subAgents as string[]) ?? [],
            );
          }
          chatInputRef.current?.setThink(
            (_thread?.metadata?.think as boolean) ?? true,
          );
          setRequireToolApproval(
            (_thread?.metadata?.requireToolApproval as boolean) ?? false,
          );
          setAgentId(_thread?.metadata?.agentId as string);
          chatInputRef.current?.setGoal(
            (_thread?.metadata?.goal as GoalConfig) ?? {
              enable: false,
              objective: '',
              status: null,
            },
          );
        };
        getThread();
        eventBus.on(`chat:onData:${threadId}`, (event: any) => {
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
          getThread();
        });
        const handlePendingConsumed = (event: {
          data: { chatId: string; id: string };
        }) => {
          if (event.data.chatId !== threadId) return;
          syncPendingSubmits(
            pendingSubmitsRef.current.filter(
              (item) => item.id !== event.data.id,
            ),
          );
        };
        window.electron.ipcRenderer.on(
          ChatEvent.ChatPendingMessageConsumed,
          handlePendingConsumed,
        );

        return () => {
          unregisterThread(threadId, true);
          eventBus.off(`chat:onData:${threadId}`);
          eventBus.off(`chat:onFinish:${threadId}`);
          window.electron.ipcRenderer.removeListener(
            ChatEvent.ChatPendingMessageConsumed,
            handlePendingConsumed,
          );
        };
      } else {
        setModelId(appInfo?.defaultModel?.model);
        setAgentId(appInfo?.defaultAgent);
        window.electron.agents
          .getAgent(appInfo?.defaultAgent)
          .then((_agent) => {
            chatInputRef.current?.setTools(_agent?.tools ?? []);
            chatInputRef.current?.setSubAgents(_agent?.subAgents ?? []);
            return null;
          })
          .catch((err) => { });
        chatInputRef.current?.setThink(true);
      }
      setFetching(false);
      return () => { };
    }, [threadId]);

    useEffect(() => {
      if (
        threadState?.metadata?.tools &&
        threadState?.metadata?.tools.length > 0
      ) {
        chatInputRef.current?.setTools(
          threadState?.metadata?.tools as string[],
        );
      }
    }, [threadState]);

    const handleShowHistory = async () => {
      const data = await window.electron.mastra.getThreadMessages({
        threadId: threadState.id,
        resourceId: `${threadState?.resourceId}.history`,
      });
      if (data.messages.length > 0) {
        setHistoryMessages(data.messages);
        setMessages(threadState.id, [
          ...data.messages,
          ...threadState.messages,
        ]);
      }
      console.log(data);
    };

    const handleExpandedMessages = useCallback(
      (messageId: string, open: boolean) => {
        setExpandedMessages((prev) => {
          if (open) {
            return [...prev, messageId];
          } else {
            return prev.filter((id) => id !== messageId);
          }
        });
      },
      [],
    );

    const handleTemplateClick = async (item: TemplateItem) => {
      console.log(item);
      if (item.prompt) {
        chatInputRef.current?.setInput(item.prompt);
      }
      chatInputRef.current?.setTools([]);
      chatInputRef.current?.setSubAgents([]);

      let tools = [];
      let subAgents = [];

      if (item.agent) {
        try {
          const _agent = await window.electron.agents.getAgent(item.agent);
          console.log(_agent);

          if (!_agent.isHidden && _agent.isActive) {
            await handleAgentChange(_agent);
            tools.push(...(_agent.tools as string[]));
            subAgents.push(...(_agent.subAgents as string[]));
          }
        } catch {
          console.error(`Agent ${item.agent} not found`);
        }
      }
      if (item?.tools && item.tools.length > 0) {
        tools.push(...item.tools);
      }
      if (item?.subAgents && item.subAgents.length > 0) {
        subAgents.push(...item.subAgents);
      }
      tools = [...new Set(tools)];
      chatInputRef.current?.setTools(tools);
      subAgents = [...new Set(subAgents)];
      chatInputRef.current?.setSubAgents(subAgents);

    };

    return (
      <div className={cn('flex flex-col h-full', className)}>
        <Conversation className="h-full w-full flex-1 flex items-center justify-center overflow-y-hidden">
          <ConversationContent className="h-full" id="chat-conversation">
            <ChatGoalBanner
              goal={threadState?.metadata?.goal as GoalConfig | undefined}
              onGoalChange={handleGoalChanged}
            />
            {!threadState && agent?.greeting && (
              <div className="flex flex-col gap-2">
                <Message from="assistant">
                  <MessageContent>
                    <MessageResponse
                      className="text-xs whitespace-normal break-all"
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
            {threadState?.historyMessagesCount > 0 &&
              historyMessages.length === 0 && (
                <div className="w-full flex flex-row justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleShowHistory();
                    }}
                  >
                    <IconArrowUp size={16} />
                    Show History
                  </Button>
                </div>
              )}

            {(!threadState || threadState?.messages.length === 0) &&
              !fetching && (
                <ChatEmpty className="h-full" onClick={handleTemplateClick} />
              )}

            {threadState?.messages.length > 0 && (
              <div className="mt-6">
                {/* <pre className="text-xs whitespace-pre-wrap break-all bg-secondary p-2 rounded-2xl mb-2">
                  {JSON.stringify(threadState?.messages, null, 2)}
                </pre> */}
                {threadState?.messages
                  .filter((x) => x.metadata?.systemReminder !== true)
                  .map((message, index: number) => {
                    return (
                      <ChatMessageItem
                        key={message.id}
                        message={message}
                        isLastMessage={
                          index === (threadState?.messages.length ?? 0) - 1
                        }
                        expanded={expandedMessages.includes(message.id)}
                        theme={theme}
                        threadId={threadId}
                        interruptedLabel={t(
                          'common.request_interrupted_by_user',
                        )}
                        onExpandedChange={handleExpandedMessages}
                        onResumeChat={handleResumeChat}
                        onToolMessageClick={onToolMessageClick}
                      />
                    );
                  })}
              </div>
            )}

            {threadState?.status === 'submitted' && (
              <Loader className="animate-spin" />
            )}
            {compressing && threadState?.status === 'streaming' && (
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
          <div className="flex flex-row gap-2 justify-between absolute w-[calc(100%-16px)] left-0 -top-10 px-4 h-8">
            <ChatAgentSelector
              key={threadId}
              value={agentId}
              mode="single"
              defaultAgentId={
                (threadState?.metadata?.agentId as string) ||
                appInfo.defaultAgent
              }
              onSelectedAgent={handleAgentChange}
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
          {pendingSubmits.length > 0 && (
            <div className="rounded-lg border bg-background/95 p-2 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <ClockIcon className="size-3.5" />
                  <span>待发送</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {pendingSubmits.length}
                  </Badge>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  当前回复结束后自动发送
                </span>
              </div>
              <div className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                {pendingSubmits.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                  >
                    <Badge
                      variant="outline"
                      className="h-5 shrink-0 px-1.5 text-[10px]"
                    >
                      #{index + 1}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {item.message.text || 'Sent with attachments'}
                    </span>
                    {(item.message.files?.length ?? 0) > 0 && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {item.message.files?.length} files
                      </span>
                    )}
                    {item.immediate && (
                      <span className="shrink-0 text-[11px] text-primary">
                        优先
                      </span>
                    )}
                    <Button
                      type="button"
                      variant={item.immediate ? 'secondary' : 'ghost'}
                      size="icon"
                      className="size-6 shrink-0"
                      title="立即提交"
                      onClick={() => submitPendingImmediately(item.id)}
                    >
                      <SendIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={() => removePendingSubmit(item.id)}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ChatInput
            onClearMessages={handleClearMessages}
            showModelSelect
            // showWebSearch
            showToolSelector
            showAgentSelector
            showGoal
            showThink
            model={modelId}
            onModelChange={handleModelChanged}
            requireToolApproval={requireToolApproval}
            onRequireToolApprovalChange={setRequireToolApproval}
            ref={chatInputRef}
            threadId={threadId}
            onSubmit={handleSubmit}
            onAbort={handleAbort}
            onGoalChange={handleGoalChanged}
            status={threadState?.status}
            className="flex-1 h-full"
          ></ChatInput>
        </div>
      </div>
    );
  },
);
