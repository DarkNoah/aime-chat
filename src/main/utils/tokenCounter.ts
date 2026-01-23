import { ModelMessage, UIMessage } from 'ai';
import { Tiktoken } from 'js-tiktoken/lite';
import o200k_base from 'js-tiktoken/ranks/o200k_base';
// import type { CoreMessage, CoreSystemMessage } from '@mastra/core/llm';

const TOKENS_PER_MESSAGE = 3.8; // tokens added for each message (start & end tokens)
const TOKENS_PER_CONVERSATION = 24; // fixed overhead for the conversation
const encoder = new Tiktoken(o200k_base);

const tokenCounter = async (
  messages?: ModelMessage[],
  // systemMessage?: CoreSystemMessage,
): Promise<number> => {
  let totalTokens = 0;

  // Start with the conversation overhead
  // totalTokens += TOKENS_PER_CONVERSATION;

  const systemMessage = messages.find((x) => x.role === 'system');

  if (systemMessage) {
    totalTokens += countTokens(systemMessage);
    // totalTokens += TOKENS_PER_MESSAGE; // Add message overhead for system message
  }

  for (const message of messages.filter((x) => x.role !== 'system')) {
    totalTokens += countTokens(message);
  }

  return Math.ceil(totalTokens);
};

export const countTokens = (message: string | ModelMessage): number => {
  if (typeof message === `string`) {
    return encoder.encode(message).length;
  }


  let tokenString = message.role;
  let overhead = 0;

  if(!message?.content){
    return 0;
  }
  if (typeof message.content === 'string' && message.content) {
    tokenString += message.content;
  } else if (Array.isArray(message.content)) {
    // Calculate tokens for each content part
    for (const part of message.content) {
      if (part.type === 'text') {
        tokenString += part.text;
      } else if (part.type === 'tool-call' || part.type === `tool-result`) {
        if (`input` in part && part.input && part.type === `tool-call`) {
          tokenString += part.toolName as any;
          if (typeof part.input === 'string') {
            tokenString += part.input;
          } else {
            tokenString += JSON.stringify(part.input);
            // minus some tokens for JSON
            // overhead -= 12;
          }
        }
        // Token cost for result if present
        if (
          `output` in part &&
          part.output !== undefined &&
          part.type === `tool-result`
        ) {
          if (typeof part.output === 'string') {
            tokenString += part.output;
          } else {
            if (part.output["type"] =="text" && part.output["text"]) {
                tokenString += part.output["text"]
            }

            // const jsonString = JSON.stringify(part.output);
            // tokenString += JSON.stringify(part.output);
            // minus some tokens for JSON
            // overhead -= 12;
          }
        }
      } else {
        // tokenString += JSON.stringify(part);
      }
    }
  }

  if (
    typeof message.content === `string` ||
    // if the message included non-tool parts, add our message overhead
    message.content.some(
      (p) => p.type !== `tool-call` && p.type !== `tool-result`,
    )
  ) {
    // Ensure we account for message formatting tokens
    // See: https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken#6-counting-tokens-for-chat-completions-api-calls
    overhead += TOKENS_PER_MESSAGE;
  }

  return Math.ceil(encoder.encode(tokenString).length + overhead);
};
export default tokenCounter;
