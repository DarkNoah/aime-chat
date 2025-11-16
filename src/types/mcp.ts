export enum McpEvent {
  McpClientUpdated = 'mcp:client-updated',
}

export type McpClientStatus = 'starting' | 'running' | 'stopped' | 'error';
