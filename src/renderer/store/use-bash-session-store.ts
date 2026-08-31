import { create } from 'zustand';
import { BashSessionUpdate, ChatEvent } from '@/types/chat';

const MAX_OUTPUT_LINES = 1_000;
const MAX_OUTPUT_LENGTH = 200_000;

export type BashSessionView = {
  threadId?: string;
  resourceId?: string;
  bashId: string;
  command: string;
  description?: string;
  directory?: string;
  stdout: string;
  stderr: string;
  errorMessage?: string;
  isExited: boolean;
  exitCode?: number | null;
  processSignal?: string | null;
  timedOut?: boolean;
  pid?: number;
  startTime: string;
  updatedAt: string;
};

type BashSessionStoreState = {
  sessions: Record<string, BashSessionView>;
  order: string[];
  isPanelOpen: boolean;
  selectedSessionId?: string;
  upsertFromEvent: (event: BashSessionUpdate) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  selectSession: (bashId: string) => void;
  stopSession: (bashId: string) => Promise<void>;
  clearCompleted: () => void;
  getRunningCount: () => number;
};

const trimOutput = (value: string) => {
  let output = value;
  let lineCount = output.endsWith('\n') ? 0 : 1;

  for (let index = output.length - 1; index >= 0; index -= 1) {
    if (output[index] === '\n') {
      lineCount += 1;
      if (lineCount > MAX_OUTPUT_LINES) {
        output = output.slice(index + 1);
        break;
      }
    }
  }

  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  return output.slice(output.length - MAX_OUTPUT_LENGTH);
};

const getPreferredSessionId = (
  sessions: Record<string, BashSessionView>,
  order: string[],
) => {
  return order.find((id) => sessions[id] && !sessions[id].isExited) ?? order[0];
};

export const useBashSessionStore = create<BashSessionStoreState>(
  (set, get) => ({
    sessions: {},
    order: [],
    isPanelOpen: false,
    selectedSessionId: undefined,

    upsertFromEvent: (event) => {
      set((state) => {
        const previous = state.sessions[event.bashId];
        const nextSession: BashSessionView = {
          threadId: event.threadId ?? previous?.threadId,
          resourceId: event.resourceId ?? previous?.resourceId,
          bashId: event.bashId,
          command: event.command ?? previous?.command ?? '',
          description: event.description ?? previous?.description,
          directory: event.directory ?? previous?.directory,
          stdout: trimOutput(
            (previous?.stdout ?? '') + (event.stdoutDelta ?? ''),
          ),
          stderr: trimOutput(
            (previous?.stderr ?? '') + (event.stderrDelta ?? ''),
          ),
          errorMessage: event.errorMessage ?? previous?.errorMessage,
          isExited: event.isExited,
          exitCode: event.exitCode ?? previous?.exitCode,
          processSignal: event.processSignal ?? previous?.processSignal,
          timedOut: event.timedOut ?? previous?.timedOut,
          pid: event.pid ?? previous?.pid,
          startTime: event.startTime ?? previous?.startTime ?? event.updatedAt,
          updatedAt: event.updatedAt,
        };

        const order = state.order.includes(event.bashId)
          ? state.order
          : [event.bashId, ...state.order];

        return {
          sessions: {
            ...state.sessions,
            [event.bashId]: nextSession,
          },
          order,
          selectedSessionId: state.selectedSessionId ?? event.bashId,
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

    selectSession: (bashId) =>
      set({ selectedSessionId: bashId, isPanelOpen: true }),

    stopSession: async (bashId) => {
      await window.electron.mastra.killBashSession(bashId);
    },

    clearCompleted: () => {
      set((state) => {
        const runningIds = state.order.filter(
          (id) => !state.sessions[id]?.isExited,
        );
        const sessions = runningIds.reduce<Record<string, BashSessionView>>(
          (acc, id) => {
            acc[id] = state.sessions[id];
            return acc;
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

    getRunningCount: () => {
      return Object.values(get().sessions).filter(
        (session) => !session.isExited,
      ).length;
    },
  }),
);

let ipcListenersInitialized = false;

export function initBashSessionIpcListeners(): void {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;

  window.electron.ipcRenderer.on(
    ChatEvent.BashSessionUpdated,
    (event: unknown) => {
      const payload = (event as { data?: BashSessionUpdate })?.data;
      if (!payload?.bashId) return;
      useBashSessionStore.getState().upsertFromEvent(payload);
    },
  );
}
