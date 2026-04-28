import { BaseProvider } from "@/main/providers/base-provider";

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


export type KnowledgeBaseVectorStoreConfig = {
  extendColumns?: { columnType: 'text' | 'blob' | 'number' | 'boolean', name: string }[]
}



export type KnowledgeBase = {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  vectorStoreType?: VectorStoreType;
  vectorStoreConfig?: KnowledgeBaseVectorStoreConfig;
  embedding?: string;
  embeddingProvider?: string;
  reranker?: string;
  returnChunkCount?: number;
  static?: boolean;
};

export type CreateKnowledgeBase = UpdateKnowledgeBase & {
  vectorStoreType?: VectorStoreType;
  vectorStoreConfig?: KnowledgeBaseVectorStoreConfig;
  embedding?: string;
};

export type UpdateKnowledgeBase = {
  name: string;
  description?: string;
  tags?: string[];
  reranker?: string;
  returnChunkCount?: number;
  forceReturnFullContent?: boolean;
};


export type SearchKnowledgeBaseResult = {
  query: string;
  embedding: string;
  results: SearchKnowledgeBaseItemResult[];
};

export type SearchKnowledgeBaseItemResult = {
  id: string;
  itemId: string;
  score: number;
  rerankScore?: number;
  hybridScore?: number;
  metadata: any;
  chunk?: string;
  type: 'text' | 'image';
  content?: string;
  name?: string;
  source?: string;
  sourceType?: KnowledgeBaseSourceType;
  extendValues?: Record<string, any>;
};

export enum KnowledgeBaseEvent {
  KnowledgeBaseItemsUpdated = 'knowledge-base:knowledge-base-items-updated',
}
