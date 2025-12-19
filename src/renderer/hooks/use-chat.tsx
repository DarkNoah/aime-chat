/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
import { Spinner } from '../components/ui/spinner';
import { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { StorageThreadType } from '@mastra/core/memory';
import { useChat as useAiSdkChat } from '@ai-sdk/react';
import { IpcChatTransport } from '../pages/chat/ipc-chat-transport';
import toast from 'react-hot-toast';
import { ChatStatus, LanguageModelUsage, UIMessage } from 'ai';
import React, {
  createContext,
  ForwardedRef,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChatSubmitOptions } from '@/types/chat';

type ChatInstanceApi = {
  sendMessage: (
    input: PromptInputMessage | undefined,
    options?: ChatSubmitOptions,
  ) => Promise<void>;
  messages: UIMessage[];
  stop: () => void;
  status?: ChatStatus;
  error?: Error;
};
export type ChatSessionProps = {
  threadId: string;
  // onFinish: (event: { type: ChatEvent; data: any }) => void;
  // onData: (dataPart: any) => void;
  onData?: (dataPart: any) => void;
  onUsageChange?: (usage: any) => void;
  onError?: (err: Error) => void;
  register: (id: string, api: ChatInstanceApi) => void;
  unregister: (id: string) => void;
  // onMessages?: (threadId: string, msgs: UIMessage[]) => void;
};

export interface ChatSessionRef {}

export const ChatSession = React.forwardRef<ChatSessionRef, ChatSessionProps>(
  (props: ChatSessionProps, ref: ForwardedRef<ChatSessionRef>) => {
    const {
      threadId,
      onError,
      onUsageChange,
      onData,
      register,
      unregister,
      // onMessages,
    } = props;
    const {
      messages: aiSdkMessages,
      setMessages,
      sendMessage: aiSdkSendMessage,
      resumeStream,
      regenerate,
      status,
      error,
      stop,
      clearError,
    } = useAiSdkChat({
      id: threadId,
      transport: new IpcChatTransport(),
      onFinish: (event) => {
        console.log('onFinish', event);
      },
      onData: (dataPart) => {
        console.log('onData', dataPart);
        onData?.(dataPart);
        if (dataPart.type === 'data-workflow-step-suspended') {
          const { runId: _runId } = dataPart.data as { runId: string };
          setRunId(_runId);
        }
        if (dataPart.type === 'data-usage') {
          onUsageChange?.(dataPart.data);
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
        onError?.(err);
        toast.error(err.message);
      },
    });
    useEffect(() => {
      const getThread = async () => {
        const _thread = await window.electron.mastra.getThread(threadId);
        console.log(_thread);
        setMessages(_thread?.messages);
      };
      getThread();
      return () => {};
    }, [threadId, setMessages]);

    useEffect(() => {
      register(threadId, {
        sendMessage: async (message, options) => {
          const inputMessage = message
            ? {
                text: message.text || 'Sent with attachments',
                files: message.files,
              }
            : undefined;
          await aiSdkSendMessage(inputMessage, {
            body: options,
            headers: {},
            metadata: {},
          });
        },
        stop,
        status,
        messages: aiSdkMessages,
      });
      return () => unregister(threadId);
    }, [
      threadId,
      register,
      unregister,
      stop,
      aiSdkSendMessage,
      status,
      aiSdkMessages,
    ]);

    // useEffect(() => {
    //   onMessages?.(threadId, aiSdkMessages);
    // }, [aiSdkMessages, onMessages, threadId]);

    return (
      <div className="p-2 h-10 bg-primary text-black flex items-center justify-center flex-row gap-2">
        {threadId.substring(0, 2)} {status}
        <div>{aiSdkMessages.length}</div>
      </div>
    );
  },
);

export type ChatState = {
  sendMessage: (
    threadId: string,
    message: PromptInputMessage,
    options?: ChatSubmitOptions,
  ) => void;
  // messages: Record<string, UIMessage[]>;
  ensureThread: (threadId: string) => Promise<
    StorageThreadType & {
      messages: UIMessage[];
    }
  >;
  unregisterThread: (threadId: string) => void;
  threads: Record<string, ChatInstanceApi>;
  // threads
  // getMessages: (threadId: string) => UIMessage[];
  // getChatInstance: (threadId: string) => void;
};

export const ChatContext = createContext<ChatState | null>(null);

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat 必须在 ChatProvider 内使用');
  }
  return context;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [threadIds, setThreadIds] = useState<string[]>([]);
  // const [messages, setMessages] = useState<Record<string, UIMessage[]>>({});
  const [threads, setThreads] = useState<Record<string, ChatInstanceApi>>({});
  // const instancesRef = useRef<Record<string, ChatInstanceApi>>({});

  const register = useCallback((threadId: string, api: ChatInstanceApi) => {
    setThreads((prev) => ({ ...prev, [threadId]: api }));
  }, []);
  const unregister = useCallback((threadId: string) => {
    setThreads((prev) => {
      delete prev[threadId];
      return prev;
    });
  }, []);

  const ensureThread = useCallback(async (threadId: string) => {
    setThreadIds((prev) =>
      prev.includes(threadId) ? prev : [...prev, threadId],
    );
    const _thread = await window.electron.mastra.getThread(threadId);
    return _thread;
  }, []);

  const unregisterThread = useCallback((threadId: string) => {
    setThreads((prev) => {
      const inst = prev[threadId];
      console.log(threadId, inst);
      if (inst && (inst.status === 'ready' || inst.status === 'error')) {
        setThreadIds((_prev) => _prev.filter((id) => id !== threadId));
      }
      return prev;
    });
  }, []);

  const sendMessage = useCallback(
    (
      threadId: string,
      message: PromptInputMessage,
      options?: ChatSubmitOptions,
    ) => {
      const inst = threads[threadId];
      if (inst) {
        inst.sendMessage(message, options);
      } else {
        toast.error(`线程 ${threadId} 未初始化`);
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      ensureThread,
      unregisterThread,
      sendMessage,
      threadIds,
      threads,
    }),
    [ensureThread, unregisterThread, sendMessage, threadIds, threads],
  );

  useEffect(() => {
    return () => {};
  }, []);

  // const handleMessages = useCallback((id: string, msgs: UIMessage[]) => {
  //   setMessages((prev) => ({ ...prev, [id]: msgs }));
  // }, []);
  return (
    <ChatContext.Provider value={value}>
      <div className="fixed top-0 left-0 p-4 flex flex-row gap-2 z-20">
        {threadIds.map((threadId) => (
          <ChatSession
            key={threadId}
            threadId={threadId}
            register={register}
            unregister={unregister}
          />
        ))}
      </div>

      {children}
    </ChatContext.Provider>
  );
}
