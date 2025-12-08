import { Agent } from '@mastra/core/agent';
import { getStorage, getVectorStore } from '../storage';
import { Memory } from '@mastra/memory';
import { LocalEmbeddingModel } from '@/main/providers/local-provider';
import { WebFetch } from '../tools/web-fetch';
import { PythonExecute } from '@/main/tools/code/python-execute';
import { Bash } from '@/main/tools/file-system/bash';

export const compressAgent = new Agent({
  id: 'compress-agent',
  name: 'Compress Agent',
  instructions: `You are a helpful AI assistant tasked with summarizing conversations.`,
  description: 'hee',
  model: 'openai/gpt-4o-mini',
});
