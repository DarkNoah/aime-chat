import { UIMessage } from '@ai-sdk/react';
import { UIMessageWithMetadata } from '@mastra/core/agent';
import { CallSettings } from 'ai';

export type ChatInput = {
  agentId?: string;
  messageId?: string;
  messages: Array<UIMessage | UIMessageWithMetadata>;
  model: string;
  webSearch: boolean;
  chatId: string;
  trigger?: string;
  think?: boolean;
  runId?: string;
  tools: string[];
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
