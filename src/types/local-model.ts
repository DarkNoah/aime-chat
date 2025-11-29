export const LocalModelTypes = ['embedding', 'reranker', 'other'] as const;
export type LocalModelType = (typeof LocalModelTypes)[number];
export type LocalModelLibrary = 'transformers' | 'openvino';
export type LocalModelItem = {
  id: string;
  description?: string;
  library?: LocalModelLibrary;
  repo?: string;
  type?: LocalModelType;
  isDownloaded?: boolean;
  download?: {
    url: string;
    source: string;
  }[];
};
