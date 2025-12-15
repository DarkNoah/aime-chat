import {
  Agent,
  AgentConfig,
  DynamicAgentInstructions,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';

export class DefaultAgent extends BaseAgent {
  id: string = 'DefaultAgent';
  name: string = 'Default Agent';
  instructions: DynamicAgentInstructions = ({ requestContext, mastra }) => {
    return {
      role: 'system',
      content: `You are a helpful assistant.`,
    };
  };
  isHidden = true;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
