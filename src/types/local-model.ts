export const LocalModelTypes = [
  'embedding',
  'reranker',
  'other',
  'ocr',
  'clip'
] as const;
export type LocalModelType = (typeof LocalModelTypes)[number];
export type LocalModelLibrary = 'transformers' | 'openvino';
export type LocalModelItem = {
  id: string;
  description?: string;
  library?: LocalModelLibrary;
  repo?: string;
  type?: LocalModelType;
  isDownloaded?: boolean;
  status?: 'not_downloaded' | 'downloading' | 'downloaded' | 'incomplete' | 'deleting';
  modelPath?: string;
  providerModelId?: string;
  download?: {
    url: string;
    source: string;
  }[];
};
