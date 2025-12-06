export type BuildAgentParams = {
  tools?: string[];
  modelId: string;
};

export type Agent = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  modelId: string;
};
