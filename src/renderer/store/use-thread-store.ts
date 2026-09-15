import { ChatStatus, UIMessage } from 'ai';
import { create } from 'zustand';
import { ThreadState } from '@/types/chat';

interface ThreadStoreState {
  threadStates: Record<string, ThreadState>;
  threadKeepList: string[];

  updateMessages: (threadId: string, messages: UIMessage[]) => void;
  updateStatus: (threadId: string, status: ChatStatus) => void;
  updateError: (threadId: string, error: Error | undefined) => void;
  updateThreadState: (threadId: string, state: Partial<ThreadState>) => void;
  updateThreadMeatadata: (
    threadId: string,
    metadata: Record<string, any>,
  ) => void;
  removeThread: (threadId: string) => void;
  registerThread: (threadId: string, state: ThreadState) => void;
  getThreads: () => Record<string, ThreadState>;
  keepThread: (threadId: string) => void;
  unkeepThread: (threadId: string) => void;
}

export const useThreadStore = create<ThreadStoreState>((set, get) => ({
  threadStates: {} as Record<string, ThreadState>,
  threadKeepList: [],

  keepThread: (threadId) => {
    set((state) => ({
      threadKeepList: [...new Set([...(state.threadKeepList ?? []), threadId])],
    }));
  },
  unkeepThread: (threadId) => {
    set((state) => ({
      threadKeepList: [
        ...new Set(
          (state.threadKeepList ?? []).filter((id) => id !== threadId),
        ),
      ],
    }));
  },

  updateMessages: (threadId, messages) => {
    get().updateThreadState(threadId, { messages });
  },

  updateStatus: (threadId, status) => {
    get().updateThreadState(threadId, { status });
  },

  updateError: (threadId, error) => {
    get().updateThreadState(threadId, { error });
  },

  // Late events must not create partial records or resurrect removed threads.
  updateThreadState: (threadId, partialState) => {
    set((state) =>
      state.threadStates[threadId]
        ? {
            threadStates: {
              ...state.threadStates,
              [threadId]: {
                messages: state.threadStates[threadId]?.messages ?? [],
                status: state.threadStates[threadId]?.status ?? 'ready',
                ...state.threadStates[threadId],
                ...partialState,
              },
            },
          }
        : state,
    );
  },

  updateThreadMeatadata: (threadId, metadata) => {
    get().updateThreadState(threadId, { metadata });
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
