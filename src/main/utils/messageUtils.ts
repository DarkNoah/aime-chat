import { ModelMessage } from 'ai';
import { MastraDBMessage } from '@mastra/core/agent';
import { isObject } from '@/utils/is';

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

  let _messages = messages.map((message: any) => {
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
  _messages = _messages.map((message: any) => {
    if (message.role === 'tool') {

      const _content = message.content.map((part: any) => {
        if (part.type === 'tool-result') {
          if (part.output.type == 'json') {
            let _output = part.output;
            if (_output.type == 'json' && isObject(_output.value) && _output.value.content && Array.isArray(_output.value.content)) {


              _output.value.content = _output.value.content.filter((item: any) => item.type !== 'image' && item.type !== 'audio' && item.type !== 'video');
            }
            return {
              ...part,
              output: _output,
            };
          }
        }
        return part;
      });
      return {
        ...message,
        content: _content,
      };
    }
    return message;
  });
  return _messages;
};
