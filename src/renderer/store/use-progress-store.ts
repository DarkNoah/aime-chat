import { create } from 'zustand';
import {
  ProgressEvent,
  ProgressEventData,
  ProgressItem,
} from '@/types/common';

interface ProgressStoreState {
  items: ProgressItem[];

  // IPC event handler - called when main process pushes progress updates
  applyEvent(data: ProgressEventData): void;

  // Actions
  removeItem(id: string): void;
  clearCompleted(): void;

  // Computed-like helpers
  getRunningCount(): number;
}

function upsert(
  items: ProgressItem[],
  data: ProgressEventData,
): ProgressItem[] {
  const now = Date.now();
  const existing = items.find((item) => item.id === data.id);

  if (data.type === 'start') {
    const next: ProgressItem = {
      id: data.id,
      title: data.title ?? existing?.title,
      message: data.message ?? existing?.message,
      percent: data.percent ?? existing?.percent ?? 0,
      status: 'running',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return existing
      ? items.map((item) => (item.id === data.id ? next : item))
      : [...items, next];
  }

  // update / end on an unknown id: treat as a fresh running item
  if (!existing) {
    const next: ProgressItem = {
      id: data.id,
      title: data.title,
      message: data.message,
      percent: data.type === 'end' ? data.percent ?? 100 : data.percent ?? 0,
      status: data.type === 'end' ? 'completed' : 'running',
      createdAt: now,
      updatedAt: now,
    };
    return [...items, next];
  }

  const next: ProgressItem = {
    ...existing,
    title: data.title ?? existing.title,
    message: data.message ?? existing.message,
    percent:
      data.percent ??
      (data.type === 'end' ? 100 : existing.percent),
    status: data.type === 'end' ? 'completed' : 'running',
    updatedAt: now,
  };
  return items.map((item) => (item.id === data.id ? next : item));
}

export const useProgressStore = create<ProgressStoreState>((set, get) => ({
  items: [],

  applyEvent: (data: ProgressEventData) => {
    if (!data?.id || !data?.type) return;
    set((state) => ({ items: upsert(state.items, data) }));
  },

  removeItem: (id: string) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter((item) => item.status !== 'completed'),
    }));
  },

  getRunningCount: () => {
    return get().items.filter((item) => item.status === 'running').length;
  },
}));

// ---- IPC event listener setup ----

let ipcListenersInitialized = false;

/**
 * 初始化进度事件监听，将主进程通过 Message 工具上报的进度同步到 store。
 * 应在应用启动时调用一次。
 */
export function initProgressIpcListeners(): void {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;

  window.electron.ipcRenderer.on(
    ProgressEvent.ProgressUpdated,
    (data: unknown) => {
      useProgressStore.getState().applyEvent(data as ProgressEventData);
    },
  );
}
