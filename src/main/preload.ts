// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { Agent } from '@/types/agent';
import {
  AppProxy,
  RuntimeInfo,
  ScreenCaptureOptions,
  ScreenCaptureResult,
  ScreenSource,
} from '@/types/app';
import { ChatInput, ThreadState } from '@/types/chat';
import {
  DirectoryTreeNode,
  FileInfo,
  PaginationInfo,
  PaginationParams,
  SearchInDirectoryParams,
  SearchInDirectoryResult,
} from '@/types/common';
import {
  AgentChannel,
  AppChannel,
  KnowledgeBaseChannel,
  LocalModelChannel,
  MastraChannel,
  ProjectChannel,
  ProviderChannel,
  TaskQueueChannel,
  InstancesChannel,
  ToolChannel,
} from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseResult,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import { LocalModelItem, LocalModelType } from '@/types/local-model';
import {
  CreateProvider,
  ModelType,
  ProviderModel,
  ProviderTag,
  ProviderTypeList,
  UpdateProvider,
} from '@/types/provider';
import { AddTaskOptions, BackgroundTask, TaskGroupConfig } from '@/types/task-queue';
import { AvailableTool, ToolType } from '@/types/tool';
import { UpdateState } from '@/types/app';
import { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import { UIMessage } from 'ai';
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
  webUtils,
} from 'electron';
import { KnowledgeBaseItem } from '@/entities/knowledge-base';

// export type Channels = 'ipc-example';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: string, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    removeListener(channel: string, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.removeListener(channel, subscription);
    },
    removeAllListeners: (channel: string) =>
      ipcRenderer.removeAllListeners(channel),
    listenerCount: (channel?: string) => {
      if (channel) return ipcRenderer.listenerCount(channel);
      return ipcRenderer.listeners.length;
    },
  },
  app: {
    getPathForFile: (file: File): string => {
      return webUtils.getPathForFile(file);
    },
    getFileInfo: (path: string): Promise<FileInfo> =>
      ipcRenderer.invoke(AppChannel.GetFileInfo, path),
    getInfo: () => ipcRenderer.invoke(AppChannel.GetInfo),
    toast: (
      title: string,
      options?: { type?: 'success' | 'error'; icon?: string },
    ) => ipcRenderer.invoke(AppChannel.Toast, title, options),
    setTheme: (theme: string) => ipcRenderer.invoke(AppChannel.SetTheme, theme),
    openPath: (path: string) => ipcRenderer.invoke(AppChannel.OpenPath, path),
    setProxy: (data: AppProxy) => ipcRenderer.invoke(AppChannel.SetProxy, data),
    setLanguage: (language: string) =>
      ipcRenderer.invoke(AppChannel.SetLanguage, language),
    showOpenDialog: (
      options: OpenDialogOptions,
    ): Promise<OpenDialogReturnValue> =>
      ipcRenderer.invoke(AppChannel.ShowOpenDialog, options),
    saveSettings: (settings: { id: string; value: any }) =>
      ipcRenderer.invoke(AppChannel.SaveSettings, settings),
    installRuntime: (pkg: string) =>
      ipcRenderer.invoke(AppChannel.InstasllRumtime, pkg),
    uninstallRuntime: (pkg: string) =>
      ipcRenderer.invoke(AppChannel.UninstallRumtime, pkg),
    getRuntimeInfo: (): Promise<RuntimeInfo> =>
      ipcRenderer.invoke(AppChannel.GetRuntimeInfo),
    setApiServerPort: (port: number) =>
      ipcRenderer.invoke(AppChannel.SetApiServerPort, port),
    toggleApiServerEnable: (enabled: boolean) =>
      ipcRenderer.invoke(AppChannel.ToggleApiServerEnable, enabled),
    // 更新相关 API
    checkForUpdates: (): Promise<UpdateState> =>
      ipcRenderer.invoke(AppChannel.CheckForUpdates),
    downloadUpdate: (): Promise<UpdateState> =>
      ipcRenderer.invoke(AppChannel.DownloadUpdate),
    installUpdate: (): Promise<void> =>
      ipcRenderer.invoke(AppChannel.InstallUpdate),
    getUpdateStatus: (): Promise<UpdateState> =>
      ipcRenderer.invoke(AppChannel.GetUpdateStatus),
    translation: (
      source: string,
      lang: string,
      force?: boolean,
    ): Promise<string> =>
      ipcRenderer.invoke(AppChannel.Translation, { source, lang, force }),
    getSetupStatus: (): Promise<{
      needsSetup: boolean;
      hasProvider: boolean;
      hasDefaultModel: boolean;
      hasRuntime: boolean;
    }> => ipcRenderer.invoke(AppChannel.GetSetupStatus),
    completeSetup: (): Promise<void> =>
      ipcRenderer.invoke(AppChannel.CompleteSetup),
    getDirectoryTree: (path: string): Promise<DirectoryTreeNode> =>
      ipcRenderer.invoke(AppChannel.GetDirectoryTree, path),
    getDirectoryChildren: (path: string): Promise<DirectoryTreeNode[]> =>
      ipcRenderer.invoke(AppChannel.GetDirectoryChildren, path),
    searchInDirectory: (
      params: SearchInDirectoryParams,
    ): Promise<SearchInDirectoryResult> =>
      ipcRenderer.invoke(AppChannel.SearchInDirectory, params),
    readFileContent: (
      filePath: string,
      options?: { limit?: number },
    ): Promise<{ content: string; truncated: boolean; size: number, mimeType: string, isBinary: boolean }> =>
      ipcRenderer.invoke(AppChannel.ReadFileContent, filePath, options),
    screenCapture: (
      options: ScreenCaptureOptions,
    ): Promise<ScreenCaptureResult> =>
      ipcRenderer.invoke(AppChannel.ScreenCapture, options),
    getScreenSources: (): Promise<ScreenSource[]> =>
      ipcRenderer.invoke(AppChannel.GetScreenSources),
  },
  providers: {
    getList: (filter?: { tags?: ProviderTag[]; onlyChatModel?: boolean }) =>
      ipcRenderer.invoke(ProviderChannel.GetList, filter),
    get: (id: string) => ipcRenderer.invoke(ProviderChannel.Get, id),
    getAvailableModels: (type: ModelType) =>
      ipcRenderer.invoke(ProviderChannel.GetAvailableModels, type),
    getProviderTypeList: (): Promise<ProviderTypeList[]> =>
      ipcRenderer.invoke(ProviderChannel.GetProviderTypeList),
    create: (data: CreateProvider) =>
      ipcRenderer.invoke(ProviderChannel.Create, data),
    update: (id: string, data: UpdateProvider) =>
      ipcRenderer.invoke(ProviderChannel.Update, id, data),
    delete: (id: string) => ipcRenderer.invoke(ProviderChannel.Delete, id),
    updateModels: (id: string, data: ProviderModel[]) =>
      ipcRenderer.invoke(ProviderChannel.UpdateModels, id, data),
    getModelList: (id: string) =>
      ipcRenderer.invoke(ProviderChannel.GetModelList, id),
  },
  mastra: {
    getThreads: ({
      page,
      size,
      resourceId,
    }: {
      page: number;
      size: number;
      resourceId?: string;
    }): Promise<PaginationInfo<StorageThreadType>> =>
      ipcRenderer.invoke(MastraChannel.GetThreads, { page, size, resourceId }),
    getThread: (id: string): Promise<ThreadState> =>
      ipcRenderer.invoke(MastraChannel.GetThread, id),
    updateThread: (id: string, data: any) =>
      ipcRenderer.invoke(MastraChannel.UpdateThread, id, data),
    createThread: (options?: any) =>
      ipcRenderer.invoke(MastraChannel.CreateThread, options),
    deleteThread: (id: string) =>
      ipcRenderer.invoke(MastraChannel.DeleteThread, id),
    chat: (data: any) => ipcRenderer.send(MastraChannel.Chat, data),
    chatWorkflow: (data: any) =>
      ipcRenderer.send(MastraChannel.ChatWorkflow, data),
    chatAbort: (chatId: string) =>
      ipcRenderer.invoke(MastraChannel.ChatAbort, chatId),
    saveMessages: (chatId: string, messages: MastraDBMessage[]) =>
      ipcRenderer.invoke(MastraChannel.SaveMessages, chatId, messages),
    clearMessages: (chatId: string) =>
      ipcRenderer.invoke(MastraChannel.ClearMessages, chatId),
    getThreadMessages: ({
      threadId,
      resourceId,
      perPage,
      page,
    }: {
      threadId: string;
      resourceId?: string;
      perPage?: number | false;
      page?: number;
    }) =>
      ipcRenderer.invoke(MastraChannel.GetThreadMessages, {
        threadId,
        resourceId,
        perPage,
        page,
      }),
    getUsage: ({
      threadId,
      resourceId,
    }: {
      threadId: string;
      resourceId?: string;
    }) => ipcRenderer.invoke(MastraChannel.GetUsage, { threadId, resourceId }),
    getUsageSummary: ({
      threadId,
      resourceId,
    }: {
      threadId?: string;
      resourceId?: string;
    }) =>
      ipcRenderer.invoke(MastraChannel.GetUsageSummary, {
        threadId,
        resourceId,
      }),
  },
  knowledgeBase: {
    create: (data: CreateKnowledgeBase) =>
      ipcRenderer.invoke(KnowledgeBaseChannel.Create, data),
    update: (id: string, data: UpdateKnowledgeBase) =>
      ipcRenderer.invoke(KnowledgeBaseChannel.Update, id, data),
    delete: (id: string) => ipcRenderer.invoke(KnowledgeBaseChannel.Delete, id),
    get: (id: string) => ipcRenderer.invoke(KnowledgeBaseChannel.Get, id),
    getList: () => ipcRenderer.invoke(KnowledgeBaseChannel.GetList),
    importSource: (data: {
      kbId: string;
      source: any;
      type: KnowledgeBaseSourceType;
    }) => ipcRenderer.invoke(KnowledgeBaseChannel.ImportSource, data),
    getKnowledgeBaseItems: (id: string, params: PaginationParams): Promise<PaginationInfo<KnowledgeBaseItem>> => ipcRenderer.invoke(KnowledgeBaseChannel.GetKnowledgeBaseItems, id, params),
    searchKnowledgeBase: (kbId: string, query: string): Promise<SearchKnowledgeBaseResult> => ipcRenderer.invoke(KnowledgeBaseChannel.SearchKnowledgeBase, kbId, query),
    deleteKnowledgeBaseItem: (id: string) => ipcRenderer.invoke(KnowledgeBaseChannel.DeleteKnowledgeBaseItem, id),
  },
  tools: {
    deleteTool: (id: string) => ipcRenderer.invoke(ToolChannel.DeleteTool, id),
    saveMCPServer: (id: string | undefined, data: string) =>
      ipcRenderer.invoke(ToolChannel.SaveMCPServer, id, data),
    getMcp: (id: string) => ipcRenderer.invoke(ToolChannel.GetMcp, id),
    getAvailableTools: (): Promise<Record<ToolType, Tool[]>> =>
      ipcRenderer.invoke(ToolChannel.GetAvailableTools),
    getList: (filter?: { type: ToolType }) =>
      ipcRenderer.invoke(ToolChannel.GetList, filter),
    getTool: (id: string) => ipcRenderer.invoke(ToolChannel.GetTool, id),
    executeTool: (id: string, toolName: string, input: any) =>
      ipcRenderer.invoke(ToolChannel.ExecuteTool, id, toolName, input),
    abortTool: (id: string, toolName) =>
      ipcRenderer.invoke(ToolChannel.AbortTool, id, toolName),
    toggleToolActive: (id: string) =>
      ipcRenderer.invoke(ToolChannel.ToggleToolActive, id),
    updateToolConfig: (id: string, value: any) =>
      ipcRenderer.invoke(ToolChannel.UpdateToolConfig, id, value),
    reconnectMCP: (id: string) =>
      ipcRenderer.invoke(ToolChannel.ReconnectMCP, id),
    saveSkill: (id: string | undefined, data: any) =>
      ipcRenderer.invoke(ToolChannel.SaveSkill, id, data),
    importSkill: (data: { files: string[] }) =>
      ipcRenderer.invoke(ToolChannel.ImportSkill, data),
    importSkills: (data: {
      repo_or_url?: string;
      files?: string[];
      path?: string;
      selectedSkills?: string[];
    }) => ipcRenderer.invoke(ToolChannel.ImportSkills, data),
    previewGitSkill: (data: { gitUrl: string }) =>
      ipcRenderer.invoke(ToolChannel.PreviewGitSkill, data),
  },
  localModel: {
    getList: (): Promise<Record<LocalModelType, LocalModelItem[]>> =>
      ipcRenderer.invoke(LocalModelChannel.GetList),
    downloadModel: (data: { modelId: string; type: string; source: string }) =>
      ipcRenderer.invoke(LocalModelChannel.DownloadModel, data),
    deleteModel: (modelId: string, type: string) =>
      ipcRenderer.invoke(LocalModelChannel.DeleteModel, modelId, type),
    setDefaultModel: (modelId: string) =>
      ipcRenderer.invoke(LocalModelChannel.SetDefaultModel, modelId),
  },
  agents: {
    importAgent: (content: string) =>
      ipcRenderer.invoke(AgentChannel.ImportAgent, content),
    getAgent: (id: string) => ipcRenderer.invoke(AgentChannel.GetAgent, id),
    getList: (): Promise<Agent[]> => ipcRenderer.invoke(AgentChannel.GetList),
    getAvailableAgents: (): Promise<Agent[]> =>
      ipcRenderer.invoke(AgentChannel.GetAvailableAgents),
    saveAgent: (agent: Agent) =>
      ipcRenderer.invoke(AgentChannel.SaveAgent, agent),
    deleteAgent: (id: string) =>
      ipcRenderer.invoke(AgentChannel.DeleteAgent, id),
    getAgentConfig: (id: string) =>
      ipcRenderer.invoke(AgentChannel.GetAgentConfig, id),
  },
  projects: {
    saveProject: (data: any) =>
      ipcRenderer.invoke(ProjectChannel.SaveProject, data),
    getProject: (id: string) =>
      ipcRenderer.invoke(ProjectChannel.GetProject, id),
    getList: ({ page, size }: { page: number; size: number }) =>
      ipcRenderer.invoke(ProjectChannel.GetList, { page, size }),
    deleteProject: (id: string) =>
      ipcRenderer.invoke(ProjectChannel.DeleteProject, id),
    createThread: (options?: any) =>
      ipcRenderer.invoke(ProjectChannel.CreateThread, options),
    deleteSkill: (projectId: string, skillId: string) =>
      ipcRenderer.invoke(ProjectChannel.DeleteSkill, projectId, skillId),
  },
  taskQueue: {
    add: (options: AddTaskOptions): Promise<string> =>
      ipcRenderer.invoke(TaskQueueChannel.Add, options),
    pause: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(TaskQueueChannel.Pause, taskId),
    resume: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(TaskQueueChannel.Resume, taskId),
    cancel: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(TaskQueueChannel.Cancel, taskId),
    remove: (taskId: string): Promise<void> =>
      ipcRenderer.invoke(TaskQueueChannel.Remove, taskId),
    getAll: (): Promise<BackgroundTask[]> =>
      ipcRenderer.invoke(TaskQueueChannel.GetAll),
    getByGroup: (groupId: string): Promise<BackgroundTask[]> =>
      ipcRenderer.invoke(TaskQueueChannel.GetByGroup, groupId),
    getGroupConfigs: (): Promise<TaskGroupConfig[]> =>
      ipcRenderer.invoke(TaskQueueChannel.GetGroupConfigs),
    setGroupConcurrency: (
      groupId: string,
      maxConcurrency: number,
    ): Promise<void> =>
      ipcRenderer.invoke(
        TaskQueueChannel.SetGroupConcurrency,
        groupId,
        maxConcurrency,
      ),
    clearCompleted: (): Promise<void> =>
      ipcRenderer.invoke(TaskQueueChannel.ClearCompleted),
  },
  instances: {
    getInstances: () => ipcRenderer.invoke(InstancesChannel.GetInstances),
    runInstance: (id: string) => ipcRenderer.invoke(InstancesChannel.RunInstance, id),
    stopInstance: (id: string) => ipcRenderer.invoke(InstancesChannel.StopInstance, id),
    updateInstance: (id: string, data: any) => ipcRenderer.invoke(InstancesChannel.UpdateInstance, id, data),
    deleteInstance: (id: string) => ipcRenderer.invoke(InstancesChannel.DeleteInstance, id),
    createInstance: (data: any) => ipcRenderer.invoke(InstancesChannel.CreateInstance, data),
    getInstance: (id: string) => ipcRenderer.invoke(InstancesChannel.GetInstance, id),
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
