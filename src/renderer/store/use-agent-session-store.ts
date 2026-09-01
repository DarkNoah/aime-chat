import { create } from 'zustand';
import {
  AgentSessionMessage,
  AgentSessionStatus,
  AgentSessionUpdate,
  ChatEvent,
} from '@/types/chat';

const MAX_MESSAGES = 1_000;
const MAX_MESSAGE_LENGTH = 100_000;

export type AgentSessionView = {
  threadId?: string;
  resourceId?: string;
  sessionId: string;
  subagentThreadId: string;
  description: string;
  prompt: string;
  subagentType: string;
  messages: AgentSessionMessage[];
  result?: string;
  errorMessage?: string;
  status: AgentSessionStatus;
  isExited: boolean;
  startTime: string;
  updatedAt: string;
};

type AgentSessionStoreState = {
  sessions: Record<string, AgentSessionView>;
  order: string[];
  isPanelOpen: boolean;
  selectedSessionId?: string;
  upsertFromEvent: (event: AgentSessionUpdate) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  selectSession: (sessionId: string) => void;
  stopSession: (sessionId: string) => Promise<void>;
  clearCompleted: () => void;
};

const getPreferredSessionId = (
  sessions: Record<string, AgentSessionView>,
  order: string[],
) => order.find((id) => sessions[id]?.status === 'running') ?? order[0];

const normalizeMessage = (
  message: AgentSessionMessage,
): AgentSessionMessage => ({
  ...message,
  content:
    message.content.length > MAX_MESSAGE_LENGTH
      ? `${message.content.slice(0, MAX_MESSAGE_LENGTH)}\n…`
      : message.content,
});

export const useAgentSessionStore = create<AgentSessionStoreState>((set) => ({
  sessions: {},
  order: [],
  isPanelOpen: false,
  selectedSessionId: undefined,

  upsertFromEvent: (event) => {
    set((state) => {
      const previous = state.sessions[event.sessionId];
      const messages = event.message
        ? [
            ...(previous?.messages ?? []),
            normalizeMessage(event.message),
          ].slice(-MAX_MESSAGES)
        : (previous?.messages ?? []);
      const nextSession: AgentSessionView = {
        threadId: event.threadId ?? previous?.threadId,
        resourceId: event.resourceId ?? previous?.resourceId,
        sessionId: event.sessionId,
        subagentThreadId:
          event.subagentThreadId ?? previous?.subagentThreadId ?? '',
        description: event.description ?? previous?.description ?? '',
        prompt: event.prompt ?? previous?.prompt ?? '',
        subagentType: event.subagentType ?? previous?.subagentType ?? '',
        messages,
        result: event.result ?? previous?.result,
        errorMessage: event.errorMessage ?? previous?.errorMessage,
        status: event.status,
        isExited: event.isExited,
        startTime: event.startTime ?? previous?.startTime ?? event.updatedAt,
        updatedAt: event.updatedAt,
      };
      const order = state.order.includes(event.sessionId)
        ? state.order
        : [event.sessionId, ...state.order];

      return {
        sessions: {
          ...state.sessions,
          [event.sessionId]: nextSession,
        },
        order,
        selectedSessionId: state.selectedSessionId ?? event.sessionId,
      };
    });
  },

  setPanelOpen: (open) =>
    set((state) => ({
      isPanelOpen: open,
      selectedSessionId: open
        ? getPreferredSessionId(state.sessions, state.order)
        : state.selectedSessionId,
    })),

  togglePanel: () =>
    set((state) => {
      const isPanelOpen = !state.isPanelOpen;
      return {
        isPanelOpen,
        selectedSessionId: isPanelOpen
          ? getPreferredSessionId(state.sessions, state.order)
          : state.selectedSessionId,
      };
    }),

  selectSession: (sessionId) =>
    set({ selectedSessionId: sessionId, isPanelOpen: true }),

  stopSession: async (sessionId) => {
    await window.electron.mastra.killAgentSession(sessionId);
  },

  clearCompleted: () => {
    set((state) => {
      const runningIds = state.order.filter(
        (id) => state.sessions[id]?.status === 'running',
      );
      const sessions = runningIds.reduce<Record<string, AgentSessionView>>(
        (accumulator, id) => {
          accumulator[id] = state.sessions[id];
          return accumulator;
        },
        {},
      );
      return {
        sessions,
        order: runningIds,
        selectedSessionId: runningIds.includes(state.selectedSessionId ?? '')
          ? state.selectedSessionId
          : runningIds[0],
      };
    });
  },
}));

let ipcListenersInitialized = false;

export function initAgentSessionIpcListeners(): void {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;

  window.electron.ipcRenderer.on(
    ChatEvent.AgentSessionUpdated,
    (event: unknown) => {
      const payload = (event as { data?: AgentSessionUpdate })?.data;
      if (!payload?.sessionId) return;
      useAgentSessionStore.getState().upsertFromEvent(payload);
    },
  );
}
