import { UIMessage } from '@ai-sdk/react';
import { UIMessageWithMetadata } from '@mastra/core/agent';
import { CallSettings } from 'ai';

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
      google?: GoogleProviderOptions & Record<string, any>;
      openai?: OpenAIProviderOptions & Record<string, any>;
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
  ChatError = 'chat:chat-error',
  ChatAbort = 'chat:chat-abort',
}

export enum ThreadEvent {
  ThreadCreated = 'thread:thread-created',
}

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
  chunks?: Record<string, string>;
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
