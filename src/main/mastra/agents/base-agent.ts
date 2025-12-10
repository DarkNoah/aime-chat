import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { getStorage } from '../storage';
import { Memory } from '@mastra/memory';

export interface BaseAgentParams {
  tools?: string[];
}

export abstract class BaseAgent {
  abstract id: string;
  abstract name: string;
  abstract description?: string;
  abstract instructions?: DynamicAgentInstructions;
  abstract tools?: string[];

  tags: string[] = [];
  constructor(params: BaseAgentParams) {
    //this.tools = params.tools;
    // super(config);
  }

  buildAgent() {
    return new Agent({
      id: this.id,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      model: 'openai/gpt-4o-mini',
      // tools: this.tools,
      memory: new Memory({
        storage: getStorage(),
      }),
    });
  }
}
