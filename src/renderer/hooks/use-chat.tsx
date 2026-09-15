import { Chat, useChat as useAiSdkChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { useShallow } from 'zustand/react/shallow';
import {
  ChatChangedType,
  ChatEvent,
  ChatSubmitOptions,
  ThreadState,
} from '@/types/chat';
import type { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { useThreadStore } from '../store/use-thread-store';
import { eventBus } from '../lib/event-bus';
import { useGlobal } from './use-global';
import { ChatRuntime } from './chat-runtime';

function ChatSession({
  chat,
  runtime,
}: {
  chat: Chat<UIMessage>;
  runtime: ChatRuntime;
}) {
  const { messages, status, error } = useAiSdkChat({ chat });
  const thread = useThreadStore((state) => state.threadStates[chat.id]);
  const { appInfo } = useGlobal();

  useEffect(() => {
    runtime.syncSession(chat.id, chat);
  }, [runtime, chat, messages, status, error]);

  return (
    <div
      className={`p-2 h-10 bg-muted-foreground/20 backdrop-blur text-xs text-muted-foreground items-center justify-center flex-row gap-2 rounded-xl ${appInfo?.isPackaged ? 'hidden' : ''}`}
    >
      {chat.id.substring(0, 2)} {thread?.status}
      <div>{thread?.messages?.length}</div>
    </div>
  );
}

export type ChatState = {
  sendEvent?: (threadId: string, event: string, data: any) => void;
  sendMessage: (
    threadId: string,
    message: PromptInputMessage | undefined,
    options?: ChatSubmitOptions,
  ) => void;
  stop: (threadId: string) => void;
  setMessages: (threadId: string, messages: UIMessage[]) => void;
  clearMessages: (threadId: string) => Promise<void>;
  clearError: (threadId: string) => void;
  ensureThread: (threadId: string, keep?: boolean) => Promise<ThreadState>;
  unregisterThread: (threadId: string, skipKeep?: boolean) => void;
  getThread: (threadId: string) => Promise<ThreadState>;
};

export const ChatContext = createContext<ChatState | null>(null);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat 必须在 ChatProvider 内使用');
  return context;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(
    () =>
      new ChatRuntime({
        onData: (threadId, data) =>
          eventBus.emit(`chat:onData:${threadId}`, data),
        onFinish: (threadId, event) =>
          eventBus.emit(`chat:onFinish:${threadId}`, event),
        onThreadChanged: (threadId, event) =>
          eventBus.emit(`chat:onThreadChanged:${threadId}`, event),
        onError: (error) => toast.error(error.message),
      }),
  );
  const sessions = useThreadStore(
    useShallow((state) =>
      Object.keys(state.threadStates).map(runtime.getSession),
    ),
  );

  const value = useMemo<ChatState>(
    () => ({
      ensureThread: runtime.ensureThread,
      unregisterThread: runtime.unregisterThread,
      getThread: (threadId) => window.electron.mastra.getThread(threadId),
      sendEvent: (threadId, event, data) =>
        eventBus.emit(`chat:onEvent:${threadId}`, { event, data }),
      sendMessage: (threadId, message, options) => {
        runtime
          .sendMessage(threadId, message, options)
          .catch(runtime.reportError);
      },
      setMessages: (threadId, messages) => {
        runtime.setMessages(threadId, messages).catch(runtime.reportError);
      },
      stop: (threadId) => {
        runtime.stop(threadId).catch(runtime.reportError);
      },
      clearMessages: runtime.clearMessages,
      clearError: runtime.clearError,
    }),
    [runtime],
  );

  useEffect(() => {
    runtime.setActive(true);
    const handleChatChanged = (event: {
      data: { type: ChatChangedType; chatId?: string; title?: string };
    }) => {
      const { chatId, type, title } = event.data;
      if (!chatId) return;
      let operation: Promise<void> | undefined;
      if (type === ChatChangedType.Start) operation = runtime.started(chatId);
      else if (type === ChatChangedType.Finish)
        operation = runtime.finished(chatId, event.data);
      else if (type === ChatChangedType.TitleUpdated)
        operation = runtime.titleChanged(chatId, title);
      operation?.catch(runtime.reportError);
    };
    const handleThreadChanged = (event: { data: { chatId: string } }) => {
      if (event.data.chatId)
        runtime
          .threadChanged(event.data.chatId, event.data)
          .catch(runtime.reportError);
    };
    const handleMessagesChanged = (event: { data: { chatId: string } }) => {
      if (event.data.chatId)
        runtime.messagesChanged(event.data.chatId).catch(runtime.reportError);
    };
    window.electron.ipcRenderer.on(ChatEvent.ChatChanged, handleChatChanged);
    window.electron.ipcRenderer.on(
      ChatEvent.ChatThreadChanged,
      handleThreadChanged,
    );
    window.electron.ipcRenderer.on(
      ChatEvent.ChatMessageChanged,
      handleMessagesChanged,
    );
    return () => {
      runtime.setActive(false);
      window.electron.ipcRenderer.removeListener(
        ChatEvent.ChatChanged,
        handleChatChanged,
      );
      window.electron.ipcRenderer.removeListener(
        ChatEvent.ChatThreadChanged,
        handleThreadChanged,
      );
      window.electron.ipcRenderer.removeListener(
        ChatEvent.ChatMessageChanged,
        handleMessagesChanged,
      );
    };
  }, [runtime]);

  return (
    <ChatContext.Provider value={value}>
      <div className="fixed top-0 left-0 flex flex-row gap-2 z-20">
        {sessions.map((chat) => (
          <ChatSession
            key={runtime.getSessionKey(chat.id)}
            chat={chat}
            runtime={runtime}
          />
        ))}
      </div>
      {children}
    </ChatContext.Provider>
  );
}
