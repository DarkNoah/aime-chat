import { UIMessage } from '@ai-sdk/react';
import { UIMessageWithMetadata } from '@mastra/core/agent';

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
};

export enum ChatEvent {
  ChatChunk = 'chat:chat-chunk',
  ChatStart = 'chat:chat-start',
  ChatFinish = 'chat:chat-finish',
  ChatUsage = 'chat:chat-usage',
  ChatError = 'chat:chat-error',
  ChatAbort = 'chat:chat-abort',
  ChatTitleUpdated = 'chat:title-updated',
}

export type ChatThread = {
  id: string;
  title: string;
  status: 'idle' | 'streaming';
};
