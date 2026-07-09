export interface RequestLogItem {
  id: string;
  thread_id: string;
  method: string;
  url: string;
  request_headers?: Record<string, unknown>;
  request_body?: string;
  status_code?: number;
  response_headers?: Record<string, unknown>;
  response_body?: string;
  duration_ms?: number;
  error?: string;
  start_time: string;
  createdAt: string;
}

export interface RequestLogListParams {
  page?: number;
  size?: number;
}

export interface RequestLogListResponse {
  items: RequestLogItem[];
  total: number;
  page: number;
  size: number;
}
