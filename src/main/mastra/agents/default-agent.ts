import {
  Agent,
  AgentConfig,
} from '@mastra/core/agent';
import { BaseAgent, BaseAgentParams } from './base-agent';

export class DefaultAgent extends BaseAgent {
  static readonly agentName = 'DefaultAgent';
  id: string = 'DefaultAgent';
  name: string = 'Default Agent';
  instructions = ({ requestContext, mastra }) => {
    return `You are a helpful assistant.`
  };
  isHidden = true;
  // model: string = 'openai/gpt-4o-mini';
  tools: string[] = [];
  constructor(params: BaseAgentParams) {
    super(params);
  }
}
