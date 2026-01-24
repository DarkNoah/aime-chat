import { UIMessage } from '@ai-sdk/react';
import { UIMessageWithMetadata } from '@mastra/core/agent';
import { CallSettings, ChatStatus } from 'ai';
import { StorageThreadType } from '@mastra/core/memory';
import type { SharedV2ProviderOptions } from '@ai-sdk/provider';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import type { XaiProviderOptions } from '@ai-sdk/xai';

export type ChatInput = {
  agentId?: string;
  projectId?: string;
  messageId?: string;
  messages: Array<UIMessage | UIMessageWithMetadata>;
  model: string;
  webSearch: boolean;
  chatId: string;
  trigger?: string;
  think?: boolean;
  runId?: string;
  tools?: string[];
  subAgents?: string[];
  requireToolApproval: boolean;
  options?: {
    modelSettings: Omit<CallSettings, 'abortSignal'>;
    providerOptions: SharedV2ProviderOptions & {
      anthropic?: AnthropicProviderOptions & Record<string, any>;
      google?: GoogleGenerativeAIProviderOptions & Record<string, any>;
      openai?: OpenAIResponsesProviderOptions & Record<string, any>;
      xai?: XaiProviderOptions & Record<string, any>;
    };
  };
  approved?: boolean;
  toolCallId?: string;
  resumeData?: Record<string, any>;
};

export enum ChatEvent {
  ChatChunk = 'chat:chat-chunk',
  ChatChanged = 'chat:chat-changed',
  ChatUsage = 'chat:chat-usage',
  ChatUsageChanged = 'chat:chat-usage-changed',
  ChatError = 'chat:chat-error',
  ChatAbort = 'chat:chat-abort',
}

export enum ThreadEvent {
  ThreadCreated = 'thread:thread-created',
}

export type ThreadState = StorageThreadType & {
  messages: UIMessage[];
  //mastraDBMessages: MastraDBMessage[];
  status: ChatStatus;
  error?: Error;
};

export enum ChatChangedType {
  Start = 'start',
  Finish = 'finish',
  TitleUpdated = 'title-updated',
}

export type ChatThread = {
  id: string;
  title: string;
  status: 'idle' | 'streaming';
};

export enum ChatPreviewType {
  WEB_PREVIEW = 'webPreview',
  CANVAS = 'canvas',
  TOOL_RESULT = 'tool-result',
  MESSAGES = 'messages',
  TODO = 'todo',
  USAGE = 'usage',
  FILE_SYSTEM = 'file-system',
}

export type ChatPreviewData = {
  previewPanel: ChatPreviewType;
  webPreviewUrl?: string;
  todos?: {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
  }[];
};

export type ChatTodo = {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
};

export type ChatRequestContext = {
  model?: string;
  threadId?: string;
  projectId?: string;
  resourceId?: string;
  tools?: string[];
  subAgents?: string[];
  agentId?: string;
  todos?: ChatTodo[];
  maxContextSize?: number;
  workspace?: string;
  chunks?: { runId: string; text: string };
};

export const DEFAULT_RESOURCE_ID = 'default';

export type ChatSubmitOptions = {
  model?: string;
  webSearch?: boolean;
  think?: boolean;
  tools?: string[];
  subAgents?: string[];
  approved?: boolean;
  toolCallId?: string;
  resumeData?: Record<string, any>;
  requireToolApproval?: boolean;
  runId?: string;
  threadId?: string;
  agentId?: string;
  projectId?: string;
};
