export type PaginationInfo<TItem> = {
  total: number;
  items: TItem[];
  page: number;
  size: number;
  hasMore: boolean;
};

export type PaginationParams = {
  page: number;
  size: number;
  filter?: string;
  filters?: Record<string, string>;
  sort?: string;
  order?: string;
};

export type FileInfo = {
  isExist: boolean;
  isFile?: boolean;
  path?: string;
  name?: string;
  ext?: string;
  size?: number;
  sizeStr?: string;
  mimeType?: string;
};

export type DirectoryTreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: DirectoryTreeNode[];
};

export type SearchResultType = 'content' | 'filename' | 'folder';

export type SearchResult = {
  type: SearchResultType;
  file: string;
  line: number;
  column: number;
  match: string;
  context: string;
};

export type SearchInDirectoryParams = {
  pattern: string;
  directory: string;
  caseSensitive?: boolean;
  limit?: number;
};

export type SearchInDirectoryResult = {
  results: SearchResult[];
  total: number;
  truncated: boolean;
};

export enum ProgressEvent {
  ProgressUpdated = 'progress:updated',
  ProgressThreadEnded = 'progress:thread-ended',
}

export type ProgressEventType = 'start' | 'update' | 'end';

export type ProgressEventData = {
  id: string;
  type: ProgressEventType;
  title?: string;
  message?: string;
  percent?: number;
  threadId?: string;
};

// 当一次执行（如代码执行）结束、中断或失败时，用于结束该线程下所有仍在进行中的进度项。
export type ProgressThreadEndedData = {
  threadId?: string;
};

export type ProgressItemStatus = 'running' | 'completed';

export type ProgressItem = {
  id: string;
  title?: string;
  message?: string;
  percent?: number;
  status: ProgressItemStatus;
  createdAt: number;
  updatedAt: number;
  threadId?: string;
};
