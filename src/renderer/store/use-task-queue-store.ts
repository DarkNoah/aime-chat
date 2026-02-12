import { create } from 'zustand';
import { AddTaskOptions, BackgroundTask } from '@/types/task-queue';
import { TaskQueueChannel } from '@/types/ipc-channel';

interface TaskQueueStoreState {
  tasks: BackgroundTask[];
  isLoading: boolean;
  isPanelOpen: boolean;

  // Actions
  fetchTasks(): Promise<void>;
  fetchTasksByGroup(groupId: string): Promise<void>;
  addTask(options: AddTaskOptions): Promise<string>;
  pauseTask(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<void>;
  cancelTask(taskId: string): Promise<void>;
  removeTask(taskId: string): Promise<void>;
  clearCompleted(): Promise<void>;
  togglePanel(): void;
  setIsPanelOpen(open: boolean): void;

  // IPC event handlers
  onTaskUpdated(task: BackgroundTask): void;
  onTaskAdded(task: BackgroundTask): void;
  onTaskRemoved(taskId: string): void;

  // Computed-like helpers
  getRunningCount(): number;
  getTasksByGroup(groupId: string): BackgroundTask[];
}

export const useTaskQueueStore = create<TaskQueueStoreState>((set, get) => ({
  tasks: [],
  isLoading: false,
  isPanelOpen: false,

  fetchTasks: async () => {
    set({ isLoading: true });
    try {
      const tasks = await window.electron.taskQueue.getAll();
      set({ tasks });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchTasksByGroup: async (groupId: string) => {
    const tasks = await window.electron.taskQueue.getByGroup(groupId);
    set((state) => {
      // 用新数据替换该 group 的任务，保留其他 group 的任务
      const otherTasks = state.tasks.filter((t) => t.groupId !== groupId);
      return { tasks: [...otherTasks, ...tasks] };
    });
  },

  addTask: async (options: AddTaskOptions) => {
    return await window.electron.taskQueue.add(options);
  },

  pauseTask: async (taskId: string) => {
    await window.electron.taskQueue.pause(taskId);
  },

  resumeTask: async (taskId: string) => {
    await window.electron.taskQueue.resume(taskId);
  },

  cancelTask: async (taskId: string) => {
    await window.electron.taskQueue.cancel(taskId);
  },

  removeTask: async (taskId: string) => {
    await window.electron.taskQueue.remove(taskId);
  },

  clearCompleted: async () => {
    await window.electron.taskQueue.clearCompleted();
  },

  togglePanel: () => {
    set((state) => ({ isPanelOpen: !state.isPanelOpen }));
  },

  setIsPanelOpen: (open: boolean) => {
    set({ isPanelOpen: open });
  },

  // IPC event handlers - called when main process pushes updates
  onTaskUpdated: (task: BackgroundTask) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  onTaskAdded: (task: BackgroundTask) => {
    set((state) => ({
      tasks: [...state.tasks, task],
    }));
  },

  onTaskRemoved: (taskId: string) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  // Computed-like helpers
  getRunningCount: () => {
    return get().tasks.filter(
      (t) => t.status === 'running' || t.status === 'pending',
    ).length;
  },

  getTasksByGroup: (groupId: string) => {
    return get().tasks.filter((t) => t.groupId === groupId);
  },
}));

// ---- IPC event listener setup ----

let ipcListenersInitialized = false;

/**
 * 初始化 IPC 事件监听，将主进程推送的任务状态同步到 store
 * 应在应用启动时调用一次
 */
export function initTaskQueueIpcListeners(): void {
  if (ipcListenersInitialized) return;
  ipcListenersInitialized = true;

  const store = useTaskQueueStore.getState();

  window.electron.ipcRenderer.on(
    TaskQueueChannel.TaskUpdated,
    (task: unknown) => {
      store.onTaskUpdated(task as BackgroundTask);
    },
  );

  window.electron.ipcRenderer.on(
    TaskQueueChannel.TaskAdded,
    (task: unknown) => {
      store.onTaskAdded(task as BackgroundTask);
    },
  );

  window.electron.ipcRenderer.on(
    TaskQueueChannel.TaskRemoved,
    (taskId: unknown) => {
      store.onTaskRemoved(taskId as string);
    },
  );

  // 首次加载全部任务
  store.fetchTasks();
}
