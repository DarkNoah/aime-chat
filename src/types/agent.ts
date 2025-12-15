export type BuildAgentParams = {
  tools?: string[];
  subAgents?: string[];
  modelId: string;
};

export type Agent = {
  id?: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  subAgents?: string[];
  isActive?: boolean;
  tags?: string[];
  isHidden?: boolean;
  type?: string;
  defaultModelId?: string;
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
