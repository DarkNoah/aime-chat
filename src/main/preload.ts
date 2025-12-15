// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { Agent } from '@/types/agent';
import { AppProxy } from '@/types/app';
import { ChatInput } from '@/types/chat';
import { PaginationInfo } from '@/types/common';
import {
  AgentChannel,
  AppChannel,
  KnowledgeBaseChannel,
  LocalModelChannel,
  MastraChannel,
  ProjectChannel,
  ProviderChannel,
  ToolChannel,
} from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import { LocalModelItem, LocalModelType } from '@/types/local-model';
import {
  CreateProvider,
  ModelType,
  ProviderModel,
  ProviderTag,
  UpdateProvider,
} from '@/types/provider';
import { AvailableTool, ToolType } from '@/types/tool';
import { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import { UIMessage } from 'ai';
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from 'electron';
import { get } from 'http';

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
    getRuntimeInfo: () => ipcRenderer.invoke(AppChannel.GetRuntimeInfo),
    setApiServerPort: (port: number) =>
      ipcRenderer.invoke(AppChannel.SetApiServerPort, port),
    toggleApiServerEnable: (enabled: boolean) =>
      ipcRenderer.invoke(AppChannel.ToggleApiServerEnable, enabled),
  },
  providers: {
    getList: (filter?: { tags?: ProviderTag[] }) =>
      ipcRenderer.invoke(ProviderChannel.GetList, filter),
    get: (id: string) => ipcRenderer.invoke(ProviderChannel.Get, id),
    getAvailableModels: (type: ModelType) =>
      ipcRenderer.invoke(ProviderChannel.GetAvailableModels, type),
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
    }: {
      page: number;
      size: number;
    }): Promise<PaginationInfo<StorageThreadType>> =>
      ipcRenderer.invoke(MastraChannel.GetThreads, { page, size }),
    getThread: (
      id: string,
    ): Promise<StorageThreadType & { messages: UIMessage[] }> =>
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
  },
  knowledgeBase: {
    create: (data: CreateKnowledgeBase) =>
      ipcRenderer.invoke(KnowledgeBaseChannel.Create, data),
    update: (id: string, data: UpdateKnowledgeBase) =>
      ipcRenderer.invoke(KnowledgeBaseChannel.Update, id, data),
    delete: (id: string) => ipcRenderer.invoke(KnowledgeBaseChannel.Delete, id),
    get: (id: string) => ipcRenderer.invoke(KnowledgeBaseChannel.Get, id),
    getList: () => ipcRenderer.invoke(KnowledgeBaseChannel.GetList),
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
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
