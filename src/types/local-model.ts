export const LocalModelTypes = [
  'embedding',
  'reranker',
  'other',
  'ocr',
  'clip',
  'tts',
  'stt',
] as const;
export type LocalModelType = (typeof LocalModelTypes)[number];
export type LocalModelLibrary = 'transformers' | 'openvino' | 'mlx' | 'pytorch';
export type LocalModelItem = {
  id: string;
  name?: string;
  description?: string;
  library?: LocalModelLibrary;
  repo?: string;
  type?: LocalModelType;
  isDownloaded?: boolean;
  status?:
    | 'not_downloaded'
    | 'downloading'
    | 'downloaded'
    | 'incomplete'
    | 'deleting';
  modelPath?: string;
  providerModelId?: string;
  speechModelId?: string;
  dependencies?: string[];
  selectable?: boolean;
  requiredFiles?: string[];
  download?: {
    url: string;
    source: string;
    repo?: string;
  }[];
};
