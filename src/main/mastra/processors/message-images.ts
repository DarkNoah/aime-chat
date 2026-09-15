import type { Processor, ProcessLLMRequestArgs } from '@mastra/core/processors';
import { filterImagesBeforeSend } from '../../utils/message-image-filter';

// This hook only changes the provider request, including resumed tool calls.
// Original images remain available in memory and in the UI.
export const messageImagesProcessor = {
  id: 'message-images',
  processLLMRequest: ({ prompt }: Pick<ProcessLLMRequestArgs, 'prompt'>) => ({
    prompt: filterImagesBeforeSend(prompt),
  }),
} satisfies Processor;
