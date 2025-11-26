import { isObject, isString } from '@/utils/is';
import { AgentInstructions } from '@mastra/core/agent';
import {
  CoreMessage,
  CoreUserMessage,
  CoreAssistantMessage,
  CoreSystemMessage,
} from '@mastra/core/llm';
import { ModelMessage, UIMessage } from 'ai';

export const convertToCoreMessages = (
  messages: Array<UIMessage | ModelMessage>,
): CoreMessage[] => {
  const coreMessages: CoreMessage[] = [];
  for (const msg of messages) {
    if ('content' in msg && 'role' in msg) {
      coreMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }
  return coreMessages;
};

export const convertToInstructionContent = (
  instructions: AgentInstructions,
): string => {
  let instructionContent;
  if (isString(instructions)) {
    instructionContent = instructions;
  } else if (Array.isArray(instructions) && instructions.length > 0) {
    if (isString(instructions[0])) {
      instructionContent = instructions.join('\n');
    } else if (isObject(instructions[0]) && 'content' in instructions[0]) {
      instructionContent = instructions.map((x) => x.content).join('\n');
    }
  } else if (isObject(instructions) && 'content' in instructions) {
    instructionContent = instructions.content;
  }
  return instructionContent;
};
