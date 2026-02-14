export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BackgroundTask {
  id: string;
  groupId: string; // 任务组 ID，用于并发控制
  type: string; // 任务类型标识，匹配注册的 handler
  name: string; // 显示名称
  status: TaskStatus;
  progress: number; // 0-100
  progressText?: string; // "3/10 files uploaded"
  data?: any; // 任务专属数据
  result?: any; // 任务完成结果
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskGroupConfig {
  groupId: string;
  maxConcurrency: number; // 该组最大同时执行数
}

export interface AddTaskOptions {
  groupId: string;
  type: string;
  name: string;
  data?: any;
  groupMaxConcurrency?: number; // 可在加入时设置/更新组并发上限
}
