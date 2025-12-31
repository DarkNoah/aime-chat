import { RequestContext } from '@mastra/core/request-context';
import { ChatRequestContext } from './chat';

export type BuildAgentParams = {
  tools?: string[];
  subAgents?: string[];
  modelId: string;
  requestContext?: RequestContext<ChatRequestContext>;
};

export type Agent = {
  id?: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  subAgents?: string[];
  suggestions?: string[];
  isActive?: boolean;
  tags?: string[];
  isHidden?: boolean;
  type?: string;
  defaultModelId?: string;
  greeting?: string;
};

export enum AgentTags {
  CODE = 'code',
  WORK = 'work',
}

export enum AgentType {
  BUILD_IN = 'build_in',
  CUSTOM = 'custom',
  A2A = 'a2a',
}
