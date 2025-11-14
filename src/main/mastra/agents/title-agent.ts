import { Agent } from '@mastra/core/agent';
import { getStorage, getVectorStore } from '../storage';
import { Memory } from '@mastra/memory';
import { Bash } from '../tools/bash';
import { LocalEmbeddingModel } from '@/main/providers/local-provider';
import { WebFetch } from '../tools/web-fetch';

export const titleAgent = new Agent({
  name: 'title-agent',
  instructions: ({ runtimeContext }) => {
    return {
      role: 'system',
      content:
        'Create a concise, 3-5 word phrase as a header for the following query, strictly adhering to the 3-5 word limit and avoiding the use of the word "title"',
    };
  },
  model: 'openai/gpt-4o-mini',
});
