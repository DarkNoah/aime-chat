export type PaginationInfo<TItem> = {
  total: number;
  items: TItem[];
  page: number;
  size: number;
  hasMore: boolean;
};
