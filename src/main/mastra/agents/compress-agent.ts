import { Agent } from '@mastra/core/agent';

const compressAgent = new Agent({
  id: 'compress-agent',
  name: 'Compress Agent',
  instructions:
    'You are a helpful AI assistant tasked with summarizing conversations.',
  model: 'openai/gpt-5-mini',
});
export default compressAgent;
