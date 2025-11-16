export enum ToolType {
  MCP = 'mcp',
  BUILD_IN = 'build-in',
  SKILL = 'skill',
}

export type Tool = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  type: ToolType;
  version?: string;
};
