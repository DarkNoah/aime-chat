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
  options?: {
    modelSettings: Omit<CallSettings, 'abortSignal'>;
    providerOptions: SharedV2ProviderOptions & {
      anthropic?: AnthropicProviderOptions & Record<string, any>;
      google?: GoogleProviderOptions & Record<string, any>;
      openai?: OpenAIProviderOptions & Record<string, any>;
      xai?: XaiProviderOptions & Record<string, any>;
    };
  };
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
