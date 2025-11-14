import { Agent } from '@mastra/core/agent';
import { getStorage, getVectorStore } from '../storage';
import { Memory } from '@mastra/memory';
import { Bash } from '../tools/bash';
import { LocalEmbeddingModel } from '@/main/providers/local-provider';
import { WebFetch } from '../tools/web-fetch';

export const reactAgent = new Agent({
  name: 'react-agent',
  instructions: ({ runtimeContext }) => {
    return {
      role: 'system',
      content: 'You are a helpful assistant.',
      providerOptions: {
        openai: { reasoningEffort: 'high' }, // OpenAI's reasoning models
        anthropic: { cacheControl: { type: 'ephemeral' } }, // Anthropic's prompt caching
      },
    };
  },
  model: 'openai/gpt-4o-mini',
  memory: new Memory({
    storage: getStorage(),
    vector: getVectorStore(),
    embedder: new LocalEmbeddingModel('Qwen/Qwen3-Embedding-0.6B', {
      modelPath: '/Volumes/Data/models/Qwen/Qwen3-Embedding-0.6B',
    }),
    options: {
      semanticRecall: true,
      workingMemory: {
        enabled: false,
      },
      lastMessages: false,
    },

    // memory:{
  }),
  tools: { Bash, WebFetch },
});
