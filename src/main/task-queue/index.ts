import { v4 as uuidv4 } from 'uuid';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { TaskQueueChannel } from '@/types/ipc-channel';
import {
  AddTaskOptions,
  BackgroundTask,
  TaskGroupConfig,
  TaskStatus,
} from '@/types/task-queue';
import { getMainWindow } from '../main';

// ---- TaskContext & TaskHandler interfaces ----

export interface TaskContext {
  /** 更新任务进度 (0-100) 及可选的进度文本 */
  updateProgress(progress: number, text?: string): void;
  /** 当前任务是否已被取消 */
  isCancelled(): boolean;
  /** 当前任务是否处于暂停状态 */
  isPaused(): boolean;
  /** 在暂停检查点调用，暂停时会 await 挂起，恢复后继续 */
  waitIfPaused(): Promise<void>;
}

export interface TaskHandler {
  execute(task: BackgroundTask, context: TaskContext): Promise<any>;
  onPause?(task: BackgroundTask): Promise<void>;
  onResume?(task: BackgroundTask): Promise<void>;
  onCancel?(task: BackgroundTask): Promise<void>;
}

// ---- Internal runtime state per task ----

interface TaskRuntime {
  cancelled: boolean;
  paused: boolean;
  pausePromise: Promise<void> | null;
  pauseResolve: (() => void) | null;
}

// ---- GroupQueue: per-group concurrency tracking ----

interface GroupQueue {
  maxConcurrency: number;
  runningCount: number;
}

// ---- TaskQueueManager ----

class TaskQueueManager extends BaseManager {
  /** All tasks keyed by id */
  private tasks: Map<string, BackgroundTask> = new Map();
  /** Runtime state per task (not serialized) */
  private runtimes: Map<string, TaskRuntime> = new Map();
  /** Registered task handlers by type */
  private handlers: Map<string, TaskHandler> = new Map();
  /** Group concurrency configs */
  private groups: Map<string, GroupQueue> = new Map();

  constructor() {
    super();
  }

  public async init(): Promise<void> {
    // Nothing to initialize for now
  }

  // ---- Public API: register handlers ----

  /**
   * 注册一个任务类型的 handler
   * 在其他 Manager 的 init() 中调用
   */
  public registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  // ---- IPC channels ----

  @channel(TaskQueueChannel.Add)
  public async addTask(options: AddTaskOptions): Promise<string> {
    const id = uuidv4();
    const task: BackgroundTask = {
      id,
      groupId: options.groupId,
      type: options.type,
      name: options.name,
      status: 'pending',
      progress: 0,
      data: options.data,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);
    this.runtimes.set(id, {
      cancelled: false,
      paused: false,
      pausePromise: null,
      pauseResolve: null,
    });

    // 确保 group 存在
    if (!this.groups.has(options.groupId)) {
      this.groups.set(options.groupId, {
        maxConcurrency: options.groupMaxConcurrency ?? 1,
        runningCount: 0,
      });
    } else if (options.groupMaxConcurrency !== undefined) {
      this.groups.get(options.groupId)!.maxConcurrency =
        options.groupMaxConcurrency;
    }

    this.sendEvent(TaskQueueChannel.TaskAdded, task);
    this.processGroup(options.groupId);

    return id;
  }

  @channel(TaskQueueChannel.Pause)
  public async pauseTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime) return;
    if (task.status !== 'running') return;

    runtime.paused = true;
    // 创建 pause promise，handler 中的 waitIfPaused() 会 await 它
    runtime.pausePromise = new Promise<void>((resolve) => {
      runtime.pauseResolve = resolve;
    });

    task.status = 'paused';
    this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });

    const handler = this.handlers.get(task.type);
    if (handler?.onPause) {
      await handler.onPause(task);
    }
  }

  @channel(TaskQueueChannel.Resume)
  public async resumeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime) return;
    if (task.status !== 'paused') return;

    runtime.paused = false;
    // resolve pause promise 使 waitIfPaused() 继续
    if (runtime.pauseResolve) {
      runtime.pauseResolve();
      runtime.pauseResolve = null;
      runtime.pausePromise = null;
    }

    task.status = 'running';
    this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });

    const handler = this.handlers.get(task.type);
    if (handler?.onResume) {
      await handler.onResume(task);
    }
  }

  @channel(TaskQueueChannel.Cancel)
  public async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime) return;

    const wasPending = task.status === 'pending';
    const wasRunning = task.status === 'running' || task.status === 'paused';

    if (!wasPending && !wasRunning) return;

    runtime.cancelled = true;
    // 如果处于暂停中，先 resolve pause promise 使其能退出
    if (runtime.pauseResolve) {
      runtime.pauseResolve();
      runtime.pauseResolve = null;
      runtime.pausePromise = null;
    }

    task.status = 'cancelled';
    task.completedAt = Date.now();
    this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });

    const handler = this.handlers.get(task.type);
    if (handler?.onCancel && wasRunning) {
      await handler.onCancel(task);
    }

    // 如果是 running 的任务取消了，减少 group 计数并调度下一个
    if (wasRunning) {
      const group = this.groups.get(task.groupId);
      if (group) {
        group.runningCount = Math.max(0, group.runningCount - 1);
      }
      this.processGroup(task.groupId);
    }
  }

  @channel(TaskQueueChannel.Remove)
  public async removeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // 如果正在运行，先取消
    if (task.status === 'running' || task.status === 'paused') {
      await this.cancelTask(taskId);
    }

    this.tasks.delete(taskId);
    this.runtimes.delete(taskId);
    this.sendEvent(TaskQueueChannel.TaskRemoved, taskId);
  }

  @channel(TaskQueueChannel.GetAll)
  public async getAllTasks(): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values());
  }

  @channel(TaskQueueChannel.GetByGroup)
  public async getTasksByGroup(groupId: string): Promise<BackgroundTask[]> {
    return Array.from(this.tasks.values()).filter(
      (t) => t.groupId === groupId,
    );
  }

  @channel(TaskQueueChannel.GetGroupConfigs)
  public async getGroupConfigs(): Promise<TaskGroupConfig[]> {
    const configs: TaskGroupConfig[] = [];
    this.groups.forEach((group, groupId) => {
      configs.push({ groupId, maxConcurrency: group.maxConcurrency });
    });
    return configs;
  }

  @channel(TaskQueueChannel.SetGroupConcurrency)
  public async setGroupConcurrency(
    groupId: string,
    maxConcurrency: number,
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (group) {
      group.maxConcurrency = maxConcurrency;
    } else {
      this.groups.set(groupId, { maxConcurrency, runningCount: 0 });
    }
    // 可能有新的任务可以调度
    this.processGroup(groupId);
  }

  @channel(TaskQueueChannel.ClearCompleted)
  public async clearCompleted(): Promise<void> {
    const toRemove: string[] = [];
    this.tasks.forEach((task) => {
      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      ) {
        toRemove.push(task.id);
      }
    });

    for (const id of toRemove) {
      this.tasks.delete(id);
      this.runtimes.delete(id);
      this.sendEvent(TaskQueueChannel.TaskRemoved, id);
    }
  }

  // ---- Internal: scheduling & execution ----

  private processGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;

    // 找到该组所有 pending 任务，按创建时间排序
    const pendingTasks = Array.from(this.tasks.values())
      .filter((t) => t.groupId === groupId && t.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);

    while (group.runningCount < group.maxConcurrency && pendingTasks.length > 0) {
      const task = pendingTasks.shift()!;
      this.executeTask(task);
    }
  }

  private executeTask(task: BackgroundTask): void {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = 'failed';
      task.error = `No handler registered for task type: ${task.type}`;
      task.completedAt = Date.now();
      this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });
      return;
    }

    const runtime = this.runtimes.get(task.id);
    if (!runtime) return;

    const group = this.groups.get(task.groupId);
    if (group) {
      group.runningCount++;
    }

    task.status = 'running';
    task.startedAt = Date.now();
    this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });

    // 构造 TaskContext
    const context: TaskContext = {
      updateProgress: (progress: number, text?: string) => {
        task.progress = Math.min(100, Math.max(0, progress));
        if (text !== undefined) {
          task.progressText = text;
        }
        this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });
      },
      isCancelled: () => runtime.cancelled,
      isPaused: () => runtime.paused,
      waitIfPaused: async () => {
        if (runtime.paused && runtime.pausePromise) {
          await runtime.pausePromise;
        }
      },
    };

    // 异步执行 handler
    handler
      .execute(task, context)
      .then((result) => {
        // 如果已经被取消了，不再更新状态
        if (runtime.cancelled) return;

        task.status = 'completed';
        task.progress = 100;
        task.result = result;
        task.completedAt = Date.now();
        this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });
      })
      .catch((error) => {
        if (runtime.cancelled) return;

        task.status = 'failed';
        task.error = error?.message || String(error);
        task.completedAt = Date.now();
        this.sendEvent(TaskQueueChannel.TaskUpdated, { ...task });
      })
      .finally(() => {
        if (group) {
          group.runningCount = Math.max(0, group.runningCount - 1);
        }
        // 调度下一个
        this.processGroup(task.groupId);
      });
  }

  // ---- Internal: send IPC event to renderer ----

  private sendEvent(channel: string, data: any): void {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }
}

export const taskQueueManager = new TaskQueueManager();
