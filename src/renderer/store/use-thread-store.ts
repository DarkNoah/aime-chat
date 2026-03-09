import { ChatStatus, UIMessage } from 'ai';
import { create } from 'zustand';

import { StorageThreadType } from '@mastra/core/memory';
import { ThreadState } from '@/types/chat';

interface ThreadStoreState {
  threadStates: Record<string, ThreadState>;

  updateMessages: (threadId: string, messages: UIMessage[]) => void;
  updateStatus: (threadId: string, status: ChatStatus) => void;
  updateError: (threadId: string, error: Error | undefined) => void;
  updateThreadState: (threadId: string, state: Partial<ThreadState>) => void;
  updateThreadMeatadata: (threadId: string, metadata: Record<string, any>) => void;
  removeThread: (threadId: string) => void;
  registerThread: (threadId: string, state: ThreadState) => void;
  getThreads: () => Record<string, ThreadState>;
}

export const useThreadStore = create<ThreadStoreState>((set, get) => ({
  threadStates: {},

  updateMessages: (threadId, messages) => {
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [threadId]: {
          ...state.threadStates[threadId],
          messages,
        },
      },
    }));
  },

  updateStatus: (threadId, status) => {
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [threadId]: {
          ...state.threadStates[threadId],
          status,
        },
      },
    }));
  },

  updateError: (threadId, error) => {
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [threadId]: {
          ...state.threadStates[threadId],
          error,
        },
      },
    }));
  },

  updateThreadState: (threadId, partialState) => {
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [threadId]: {
          messages: state.threadStates[threadId]?.messages ?? [],
          status: state.threadStates[threadId]?.status ?? 'ready',
          ...state.threadStates[threadId],
          ...partialState,
        },
      },
    }));
  },

  updateThreadMeatadata: (threadId, metadata) => {
    set((state) => ({
      threadStates: {
        ...state.threadStates,
        [threadId]: { ...state.threadStates[threadId], metadata },
      },
    }));
  },

  removeThread: (threadId) => {
    set((state) => {
      const { [threadId]: _, ...rest } = state.threadStates;
      return { ...state, threadStates: rest };
    });
  },

  getThread: (threadId) => {
    return get().threadStates[threadId];
  },

  getThreads: () => {
    return get().threadStates;
  },

  registerThread: (threadId, thread) => {
    set((state) => {
      if (state.threadStates[threadId]) {
        return state;
      }
      return {
        ...state,
        threadStates: { ...state.threadStates, [threadId]: thread },
      };
    });
  },
}));
