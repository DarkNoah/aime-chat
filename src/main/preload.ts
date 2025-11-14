// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { AppProxy } from '@/types/app';
import { ChatInput } from '@/types/chat';
import { PaginationInfo } from '@/types/common';
import {
  AppChannel,
  KnowledgeBaseChannel,
  MastraChannel,
  ProviderChannel,
} from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import {
  CreateProvider,
  ModelType,
  ProviderModel,
  UpdateProvider,
} from '@/types/provider';
import { StorageThreadType } from '@mastra/core/memory';
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
    setTheme: (theme: string) => ipcRenderer.invoke(AppChannel.SetTheme, theme),
    openPath: (path: string) => ipcRenderer.invoke(AppChannel.OpenPath, path),
    send: (title: string, message: string) =>
      ipcRenderer.invoke(AppChannel.Send, title, message),
    setProxy: (data: AppProxy) => ipcRenderer.invoke(AppChannel.SetProxy, data),
    setLanguage: (language: string) =>
      ipcRenderer.invoke(AppChannel.SetLanguage, language),
    showOpenDialog: (
      options: OpenDialogOptions,
    ): Promise<OpenDialogReturnValue> =>
      ipcRenderer.invoke(AppChannel.ShowOpenDialog, options),
    saveSettings: (settings: { id: string; value: any }) =>
      ipcRenderer.invoke(AppChannel.SaveSettings, settings),
  },
  providers: {
    getList: () => ipcRenderer.invoke(ProviderChannel.GetList),
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
    createThread: () => ipcRenderer.invoke(MastraChannel.CreateThread),
    deleteThread: (id: string) =>
      ipcRenderer.invoke(MastraChannel.DeleteThread, id),
    chat: (data: any) => ipcRenderer.send(MastraChannel.Chat, data),
    chatAbort: (chatId: string) =>
      ipcRenderer.invoke(MastraChannel.ChatAbort, chatId),
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
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
