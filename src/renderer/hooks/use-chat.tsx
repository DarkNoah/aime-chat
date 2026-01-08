/* eslint-disable no-underscore-dangle */
/* eslint-disable camelcase */
import { PromptInputMessage } from '../components/ai-elements/prompt-input';
import { useChat as useAiSdkChat } from '@ai-sdk/react';

import { IpcChatTransport } from '../pages/chat/ipc-chat-transport';
import toast from 'react-hot-toast';
import { ChatOnFinishCallback, UIDataTypes, UIMessage, UITools } from 'ai';
import React, {
  createContext,
  ForwardedRef,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChatChangedType,
  ChatEvent,
  ChatSubmitOptions,
  ThreadState,
} from '@/types/chat';
import { useThreadStore } from '../store/use-thread-store';
import { useShallow } from 'zustand/react/shallow';
import { eventBus } from '../lib/event-bus';

export type ChatSessionProps = {
  threadId: string;
  onData?: (dataPart: any) => void;
  onUsageChange?: (usage: any) => void;
  onError?: (err: Error) => void;
  onFinish?: (event: any) => void;
};

export type ChatSessionRef = {
  stop: () => void;
  sendMessage: (
    message: PromptInputMessage | undefined,
    options?: ChatSubmitOptions,
  ) => void;
  setMessages: (messages: UIMessage[]) => void;
  clearError: () => void;
  clearMessages: () => Promise<void>;
};

export const ChatSession = React.forwardRef<ChatSessionRef, ChatSessionProps>(
  (props: ChatSessionProps, ref: ForwardedRef<ChatSessionRef>) => {
    const { threadId, onError, onUsageChange, onData, onFinish } = props;

    const threadState = useThreadStore(
      useShallow((s) => s.threadStates[threadId]),
    );
    const {
      updateMessages,
      updateStatus,
      updateError,
      updateThreadState,
      registerThread,
    } = useThreadStore();

    // 使用 useRef 保持 transport 实例稳定，避免每次渲染创建新实例
    const transportRef = useRef(new IpcChatTransport());

    const {
      messages: aiSdkMessages,
      setMessages,
      sendMessage: aiSdkSendMessage,
      status,
      error,
      stop,
      clearError,
    } = useAiSdkChat({
      id: threadId,
      transport: transportRef.current,
      onFinish: (event) => {
        console.log('onFinish', event);
        onFinish?.(event);
      },
      onData: (dataPart) => {
        console.log('onData', dataPart);
        onData?.(dataPart);
        if (dataPart.type === 'data-usage') {
          onUsageChange?.(dataPart.data);
        }
      },
      onError: (err) => {
        onError?.(err);
        toast.error(err.message);
      },
    });

    useEffect(() => {
      const thread = useThreadStore.getState().threadStates[threadId];
      if (thread) {
        setMessages(thread.messages);
      }
    }, [setMessages, threadId]);

    const clearMessages = async () => {
      await window.electron.mastra.clearMessages(threadId);
      updateMessages(threadId, []);
      updateError(threadId, undefined);
      setMessages([]);
      clearError();
    };

    useImperativeHandle(ref, () => ({
      sendMessage: (message, options) => {
        aiSdkSendMessage(
          message
            ? {
                text: message.text || 'Sent with attachments',
                files: message.files,
              }
            : undefined,
          {
            body: options,
            headers: {},
            metadata: {},
          },
        );
      },
      stop,
      clearError,
      clearMessages,
      setMessages: (message) => {
        setMessages(message);
      },
    }));

    useEffect(() => {
      updateMessages(threadId, aiSdkMessages);
    }, [threadId, aiSdkMessages, updateMessages]);

    useEffect(() => {
      updateStatus(threadId, status);
    }, [threadId, status, updateStatus]);

    useEffect(() => {
      updateError(threadId, error);
    }, [threadId, error, updateError]);

    return (
      <div className=" p-2 h-10 bg-muted-foreground/20 backdrop-blur text-muted-foreground flex items-center justify-center flex-row gap-2 rounded-xl hidden!">
        {threadId.substring(0, 2)} {threadState.status}
        <div>{threadState.messages?.length}</div>
      </div>
    );
  },
);

export type ChatState = {
  sendMessage: (
    threadId: string,
    message: PromptInputMessage | undefined,
    options?: ChatSubmitOptions,
  ) => void;
  stop: (threadId: string) => void;
  setMessages: (threadId: string, messages: UIMessage[]) => void;
  clearMessages: (threadId: string) => Promise<void>;
  clearError: (threadId: string) => void;
  ensureThread: (threadId: string) => Promise<ThreadState>;
  unregisterThread: (threadId: string) => void;
  getThread: (threadId: string) => Promise<ThreadState>;
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
  const { threadStates } = useThreadStore();

  const { registerThread, removeThread, updateMessages, updateThreadState } =
    useThreadStore();

  const chatSessionRefs = useRef(new Map<string, ChatSessionRef>());
  const getThread = useCallback(async (threadId: string) => {
    const _thread = await window.electron.mastra.getThread(threadId);
    return _thread;
  }, []);

  const ensureThread = useCallback(
    async (threadId: string) => {
      if (threadStates[threadId]) {
        return threadStates[threadId];
      } else {
        const _thread = await window.electron.mastra.getThread(threadId);
        console.log('registerThread', threadId, _thread);
        registerThread(threadId, _thread);
        return _thread;
      }
    },
    [threadStates, registerThread],
  );

  const unregisterThread = useCallback(
    (threadId: string) => {
      const threadState = useThreadStore.getState().threadStates[threadId];
      if (
        threadState &&
        (threadState.status === 'ready' || threadState.status === 'error')
      ) {
        console.log('removeThread', threadId);
        chatSessionRefs.current.delete(threadId);
        removeThread(threadId);
      }
    },
    [removeThread],
  );

  const sendMessage = useCallback(
    (
      threadId: string,
      message: PromptInputMessage | undefined,
      options?: ChatSubmitOptions,
    ) => {
      const chatSessionRef = chatSessionRefs.current.get(threadId);
      if (chatSessionRef) {
        chatSessionRef.sendMessage(message, options);
      } else {
        toast.error(`线程 ${threadId} 未初始化`);
      }
    },
    [chatSessionRefs],
  );

  const stop = useCallback(
    (threadId: string) => {
      const chatSessionRef = chatSessionRefs.current.get(threadId);
      if (chatSessionRef) {
        chatSessionRef.stop();
      } else {
        toast.error(`线程 ${threadId} 未初始化`);
      }
    },
    [chatSessionRefs],
  );

  const clearMessages = useCallback(async (threadId: string) => {
    const chatSessionRef = chatSessionRefs.current.get(threadId);
    if (chatSessionRef) {
      chatSessionRef.clearMessages();
    } else {
      toast.error(`线程 ${threadId} 未初始化`);
    }
    // await window.electron.mastra.clearMessages(threadId);
    // updateMessages(threadId, []);
  }, []);

  const clearError = useCallback((threadId: string) => {
    const chatSessionRef = chatSessionRefs.current.get(threadId);
    if (chatSessionRef) {
      chatSessionRef.stop();
    } else {
      toast.error(`线程 ${threadId} 未初始化`);
    }
  }, []);

  const setMessages = useCallback((threadId: string, messages: UIMessage[]) => {
    const chatSessionRef = chatSessionRefs.current.get(threadId);
    if (chatSessionRef) {
      chatSessionRef.setMessages(messages);
    } else {
      toast.error(`线程 ${threadId} 未初始化`);
    }
  }, []);

  const onFinish = useCallback((threadId, event) => {
    eventBus.emit(`chat:onFinish:${threadId}`, event);
    window.electron.mastra
      .getThreadMessages({ threadId })
      .then((data) => {
        setMessages(threadId, data.messages);
        return data;
      })
      .catch((err) => {
        toast.error(err.message);
      });
  }, []);

  const onData = useCallback((threadId, event) => {
    eventBus.emit(`chat:onData:${threadId}`, event);
  }, []);

  const value = useMemo(
    () => ({
      ensureThread,
      unregisterThread,
      sendMessage,
      setMessages,
      getThread,
      stop,
      clearMessages,
      clearError,
    }),
    [
      ensureThread,
      unregisterThread,
      sendMessage,
      setMessages,
      getThread,
      stop,
      clearMessages,
      clearError,
    ],
  );

  useEffect(() => {
    const handleChatChangedEvent = (event: {
      data: {
        type: ChatChangedType;
        chatId?: string;
        title?: string;
      };
    }) => {
      console.log('handleChatChangedEvent', event.data);
      if (event.data.type === ChatChangedType.TitleUpdated) {
        updateThreadState(event.data.chatId, {
          title: event.data.title,
        });
      }
    };
    window.electron.ipcRenderer.on(
      ChatEvent.ChatChanged,
      handleChatChangedEvent,
    );
    return () => {
      window.electron.ipcRenderer.removeListener(
        ChatEvent.ChatChanged,
        handleChatChangedEvent,
      );
    };
  }, []);

  return (
    <ChatContext.Provider value={value}>
      <div className="fixed top-0 left-0 flex flex-row gap-2 z-20">
        {Object.keys(threadStates).map((threadId) => (
          <ChatSession
            key={threadId}
            threadId={threadId}
            ref={(node) => {
              if (node) {
                chatSessionRefs.current.set(threadId, node);
              } else {
                chatSessionRefs.current.delete(threadId);
              }
            }}
            onFinish={(event) => onFinish(threadId, event)}
            onData={(event) => onData(threadId, event)}
          />
        ))}
      </div>
      {children}
    </ChatContext.Provider>
  );
}
