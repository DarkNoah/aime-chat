import { ModelMessage } from 'ai';
import { MastraDBMessage } from '@mastra/core/agent';

export const getLastMessageIndex = async (
  messages: (ModelMessage | MastraDBMessage)[],
  role: 'system' | 'user' | 'assistant' | 'tool',
): Promise<number> => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) {
      return i;
    }
  }
  return -1;
};

export const filterFilePartsForModel = (
  messages: ModelMessage[],
  supportsVision: boolean,
): ModelMessage[] => {
  if (supportsVision) {
    return messages;
  }

  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }

    const content = message.content.filter((part) => part.type !== 'file');
    if (content.length === message.content.length) {
      return message;
    }

    return {
      ...message,
      content,
    };
  });
};
