import { Agent } from '@mastra/core/agent';
import { getStorage, getVectorStore } from '../storage';
import { Memory } from '@mastra/memory';
import { LocalEmbeddingModel } from '@/main/providers/local-provider';
import { WebFetch } from '../tools/web-fetch';
import { PythonExecute } from '@/main/tools/code/python-execute';
import { Bash } from '@/main/tools/file-system/bash';

export const reactAgent = new Agent({
  name: 'react-agent',
  instructions: ({ requestContext }) => {
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
      semanticRecall: false,
      workingMemory: {
        enabled: false,
      },
      lastMessages: false,
    },

    // memory:{
  }),
  tools: { Bash: Bash.build(), WebFetch, PythonExecute },
});
