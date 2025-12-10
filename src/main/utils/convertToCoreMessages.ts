import { isFunction, isObject, isString } from '@/utils/is';
import {
  AgentInstructions,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import {
  CoreMessage,
  CoreUserMessage,
  CoreAssistantMessage,
  CoreSystemMessage,
  SystemMessage,
} from '@mastra/core/llm';
import { ModelMessage, UIMessage } from 'ai';
import { RequestContext } from '@mastra/core/request-context';

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

export const convertToInstructionContent = async (
  instructions: DynamicAgentInstructions | AgentInstructions,
): Promise<string> => {
  let _instructions;
  let instructionContent;

  if (isFunction(instructions)) {
    _instructions = await instructions({
      requestContext: new RequestContext(),
    });
  } else {
    _instructions = instructions;
  }
  if (isString(_instructions)) {
    instructionContent = _instructions;
  } else if (Array.isArray(_instructions) && _instructions.length > 0) {
    if (isString(_instructions[0])) {
      instructionContent = _instructions.join('\n');
    } else if (isObject(_instructions[0]) && 'content' in _instructions[0]) {
      instructionContent = _instructions.map((x) => x.content).join('\n');
    }
  } else if (isObject(_instructions) && 'content' in _instructions) {
    instructionContent = _instructions.content;
  }
  return instructionContent;
};
