import { ModelMessage } from 'ai';

export const getLastMessageIndex = async (
  messages: ModelMessage[],
  role: 'system' | 'user' | 'assistant' | 'tool',
): Promise<number> => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) {
      return i;
    }
  }
  return -1;
};
