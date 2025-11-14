export enum VectorStoreType {
  LibSQL = 'libsql',
}
export enum KnowledgeBaseItemState {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Fail = 'fail',
}
export enum KnowledgeBaseSourceType {
  Web = 'web',
  File = 'file',
  Folder = 'folder',
  Text = 'text',
}

export interface CreateKnowledgeBase {
  name: string;
  description?: string;
  tags?: string[];
  vectorStoreType?: VectorStoreType;
  vectorStoreConfig?: any;
  embedding?: string;
  reranker?: string;
  static?: boolean;
  returnChunkCount?: number;
}

export interface UpdateKnowledgeBase {
  name: string;
  description?: string;
  tags?: string[];
  reranker?: string;
  returnChunkCount?: number;
}
