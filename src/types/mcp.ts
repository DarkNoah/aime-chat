export enum McpEvent {
  McpClientUpdated = 'mcp:client-updated',
}

export type McpClientStatus = 'starting' | 'running' | 'stopped' | 'error';

export type ImportMcp = {
  mcpConfig: string;
};

export type CreateMcp = {
  name: string;
  type: 'stdio' | 'sse';
  url?: string;
  command?: string;
  args?: string;
  headers?: Record<string, string>;
  env?: string;
};
