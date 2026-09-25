import type { AppInfo } from './app';

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
export type DownloadLocalModelInput = {
  modelId: string;
  type: string;
  source: string;
  /** Apply the type-specific default only after the model is ready. */
  setAsDefault?: boolean;
};

export const LOCAL_MODEL_DEFAULT_FIELDS: Partial<
  Record<LocalModelType, keyof AppInfo['defaultModel']>
> = {
  embedding: 'embeddingModel',
  clip: 'embeddingModel',
  reranker: 'rerankerModel',
  tts: 'speechModel',
  stt: 'transcriptionModel',
};
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
