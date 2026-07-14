import { create } from 'zustand';
import { ChatEvent } from '@/types/chat';
import type { SSHSessionUpdate, SSHTarget } from '@/types/chat';

export type SSHSessionView = {
  connectionId: string;
  target: SSHTarget;
  state: SSHSessionUpdate['state'];
  screen: string;
  cursor: SSHSessionUpdate['cursor'];
  exitCode?: number;
  signal?: number;
  error?: string;
  startTime: string;
  updatedAt: string;
};

type SSHSessionStoreState = {
  sessions: Record<string, SSHSessionView>;
  order: string[];
  isPanelOpen: boolean;
  selectedSessionId?: string;
  upsertFromEvent: (event: SSHSessionUpdate) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  selectSession: (connectionId: string) => void;
  closeSession: (connectionId: string) => Promise<void>;
  clearExited: () => void;
};

export const formatSSHTarget = (target: SSHTarget) => {
  if (target.type === 'config') return target.name;
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${target.username ? `${target.username}@` : ''}${host}:${target.port ?? 22}`;
};

export const useSSHSessionStore = create<SSHSessionStoreState>((set) => ({
  sessions: {},
  order: [],
  isPanelOpen: false,
  selectedSessionId: undefined,

  upsertFromEvent: (event) => {
    set((state) => {
      const previous = state.sessions[event.connectionId];
      const nextSession: SSHSessionView = {
        connectionId: event.connectionId,
        target: event.target,
        state: event.state,
        screen: event.screen,
        cursor: event.cursor,
        exitCode: event.exitCode ?? previous?.exitCode,
        signal: event.signal ?? previous?.signal,
        error: event.error ?? previous?.error,
        startTime: event.startTime,
        updatedAt: event.updatedAt,
      };
      const order = state.order.includes(event.connectionId)
        ? state.order
        : [event.connectionId, ...state.order];

      return {
        sessions: {
          ...state.sessions,
          [event.connectionId]: nextSession,
        },
        order,
        selectedSessionId: state.selectedSessionId ?? event.connectionId,
      };
    });
  },

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  selectSession: (connectionId) =>
    set({ selectedSessionId: connectionId, isPanelOpen: true }),

  closeSession: async (connectionId) => {
    await window.electron.mastra.closeSSHSession(connectionId);
  },

  clearExited: () => {
    set((state) => {
      const runningIds = state.order.filter(
        (id) => state.sessions[id]?.state === 'running',
      );
      const sessions = runningIds.reduce<Record<string, SSHSessionView>>(
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

export function initSSHSessionIpcListeners(): void {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;

  window.electron.ipcRenderer.on(
    ChatEvent.SSHSessionUpdated,
    (event: unknown) => {
      const payload = (event as { data?: SSHSessionUpdate })?.data;
      if (!payload?.connectionId) return;
      useSSHSessionStore.getState().upsertFromEvent(payload);
    },
  );
}
