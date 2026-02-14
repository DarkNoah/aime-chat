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
