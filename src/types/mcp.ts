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
  cwd?: string;
  headers?: Record<string, string>;
  env?: string;
};

export type McpBundleUserConfigValue =
  | string
  | number
  | boolean
  | string[];

export type McpBundleUserConfigOption = {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;
  description: string;
  required?: boolean;
  default?: McpBundleUserConfigValue;
  multiple?: boolean;
  sensitive?: boolean;
  min?: number;
  max?: number;
};

export type McpBundlePreview = {
  filePath: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  serverType: 'python' | 'node' | 'binary' | 'uv';
  manifestVersion: string;
  userConfig: Record<string, McpBundleUserConfigOption>;
  defaultUserConfig: Record<string, McpBundleUserConfigValue>;
  tools: Array<{ name: string; description?: string }>;
  platformSupported: boolean;
  supportedPlatforms?: Array<'darwin' | 'win32' | 'linux'>;
  installed?: {
    toolId: string;
    version?: string;
    isBundle: boolean;
  };
};

export type InstallMcpBundleInput = {
  filePath: string;
  userConfig: Record<string, McpBundleUserConfigValue>;
  replaceToolId?: string;
};

export type InstallMcpBundleResult = {
  id: string;
  name: string;
};
