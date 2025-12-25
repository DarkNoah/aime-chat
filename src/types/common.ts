export type PaginationInfo<TItem> = {
  total: number;
  items: TItem[];
  page: number;
  size: number;
  hasMore: boolean;
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
