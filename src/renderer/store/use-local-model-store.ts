import { create } from 'zustand';

interface LocalModelStoreState {
  downloadingIds: Set<string>;
  startDownload(id: string): boolean;
  finishDownload(id: string): void;
}

export const useLocalModelStore = create<LocalModelStoreState>((set, get) => ({
  downloadingIds: new Set(),

  startDownload: (id: string) => {
    if (get().downloadingIds.has(id)) return false;

    set((state) => ({
      downloadingIds: new Set(state.downloadingIds).add(id),
    }));
    return true;
  },

  finishDownload: (id: string) => {
    set((state) => {
      const downloadingIds = new Set(state.downloadingIds);
      downloadingIds.delete(id);
      return { downloadingIds };
    });
  },
}));
