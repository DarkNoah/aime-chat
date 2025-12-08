import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { getStorage } from '../storage';
import { Memory } from '@mastra/memory';

export abstract class BaseAgent {
  abstract id: string;
  abstract name: string;
  abstract description?: string;
  abstract instructions?: DynamicAgentInstructions;
  abstract tools?: string[];

  tags: string[] = [];
  constructor() {
    // super(config);
  }

  buildAgent() {
    return new Agent({
      id: this.id,
      name: this.name,
      instructions: this.instructions,
      model: 'openai/gpt-4o-mini',
      // tools: this.tools,
      memory: new Memory({
        storage: getStorage(),
      }),
    });
  }
}
