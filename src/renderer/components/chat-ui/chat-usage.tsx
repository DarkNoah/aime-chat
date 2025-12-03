import React, { ForwardedRef, Fragment } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationProps,
  ConversationScrollButton,
} from '../ai-elements/conversation';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '../ai-elements/sources';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '../ai-elements/reasoning';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message';
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextProps,
  ContextReasoningUsage,
  ContextTrigger,
} from '../ai-elements/context';
import { MastraDBMessage } from '@mastra/core/agent/message-list';
import { CopyIcon, Loader, MessageSquareIcon } from 'lucide-react';
import { ChatStatus, ToolUIPart, LanguageModelUsage } from 'ai';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Label } from '../ui/label';
import {
  ChatMessageAttachment,
  ChatMessageAttachments,
} from './chat-message-attachment';
import { ToolMessage, ToolMessageApproval } from './tool-message';
import { IconArrowDown } from '@tabler/icons-react';
import { ChatPreviewData, ChatPreviewType } from '../../../types/chat';

export type ChatUsageProps = ContextProps & {
  value?: {
    usage?: LanguageModelUsage;
    maxTokens?: number;
    modelId?: string;
  };
};

export interface ChatUsageRef {}

export const ChatUsage = React.forwardRef<ChatUsageRef, ChatUsageProps>(
  (props: ChatUsageProps, ref: ForwardedRef<ChatUsageRef>) => {
    const { value } = props as {
      value?: {
        usage?: LanguageModelUsage;
        maxTokens?: number;
        modelId?: string;
      };
    };
    return (
      <Context
        {...props}
        maxTokens={value?.maxTokens}
        modelId={value?.modelId}
        usage={value?.usage}
        usedTokens={value?.usage?.totalTokens}
      >
        <ContextTrigger size="sm" />
        <ContextContent>
          <ContextContentHeader />
          <ContextContentBody>
            <ContextInputUsage />
            <ContextOutputUsage />
            <ContextReasoningUsage />
            <ContextCacheUsage />
          </ContextContentBody>
          <ContextContentFooter />
        </ContextContent>
      </Context>
    );
  },
);
