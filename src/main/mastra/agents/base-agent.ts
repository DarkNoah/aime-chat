import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { getStorage } from '../storage';
import { Memory } from '@mastra/memory';
import { LanguageModel } from 'ai';

export interface BaseAgentParams {
  tools?: string[];
}

export abstract class BaseAgent {
  abstract id: string;
  abstract name: string;
  description?: string;
  abstract instructions?: DynamicAgentInstructions;
  abstract tools?: string[];
  subAgents?: string[];
  isHidden: boolean = false;

  tags: string[] = [];
  constructor(params: BaseAgentParams) {
    //this.tools = params.tools;
    // super(config);
  }

  buildAgent({ model }: { model?: LanguageModel } = {}) {
    return new Agent({
      id: this.id,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      model: model || 'openai/gpt-4o-mini',
      // tools: this.tools,
      memory: new Memory({
        storage: getStorage(),
      }),
    });
  }
}
