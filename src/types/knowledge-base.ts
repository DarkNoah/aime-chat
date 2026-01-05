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

export type KnowledgeBase = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  vectorStoreType?: VectorStoreType;
  vectorStoreConfig?: any;
  embedding?: string;
  reranker?: string;
  returnChunkCount?: number;
};

export type CreateKnowledgeBase = UpdateKnowledgeBase & {
  vectorStoreType?: VectorStoreType;
  vectorStoreConfig?: any;
  embedding?: string;
};

export type UpdateKnowledgeBase = {
  name: string;
  description?: string;
  tags?: string[];
  reranker?: string;
  returnChunkCount?: number;
};
