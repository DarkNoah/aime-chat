import { Agent } from '@mastra/core/agent';
import { getStorage, getVectorStore } from '../storage';
import { Memory } from '@mastra/memory';
import { LocalEmbeddingModel } from '@/main/providers/local-provider';
import { WebFetch } from '../tools/web-fetch';
import { PythonExecute } from '@/main/tools/code/python-execute';
import { Bash } from '@/main/tools/file-system/bash';

export const compressAgent = new Agent({
  name: 'compress-agent',
  instructions: `You are a helpful AI assistant tasked with summarizing conversations.`,
  model: 'openai/gpt-4o-mini',
});
