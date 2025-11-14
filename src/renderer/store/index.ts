import { create } from "zustand";

export type ProviderItem = {
  id: string;
  name: string;
  models: { id: string; name: string }[];
};

type ProvideState = {
  provides: Array<ProviderItem>;
  defaultModel: string;
  isLoading: boolean;
  error: string | null;
  setProvides: (items: Array<ProviderItem>) => void;
  setDefaultModel: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (msg: string | null) => void;
};

export const useProviderStore = create<ProvideState>((set, get) => ({
  provides: [],
  defaultModel: null,
  isLoading: false,
  error: null,
  setProvides: (items) => set({ provides: items }),
  setDefaultModel: (id) => set({ defaultModel: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (msg) => set({ error: msg }),
}));
