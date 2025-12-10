export type BuildAgentParams = {
  tools?: string[];
  modelId: string;
};

export type Agent = {
  id: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  isActive?: boolean;
  tags?: string[];
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
