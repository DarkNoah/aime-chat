import type { MCPClient } from '@mastra/mcp';
import type { McpClientStatus } from '@/types/mcp';

export type McpClientState = {
  id: string;
  mcp: MCPClient;
  status: McpClientStatus;
  error?: Error;
  tools?: Awaited<ReturnType<MCPClient['listTools']>>;
};

export async function loadMcpTools(
  client: Pick<McpClientState, 'mcp' | 'tools'>,
) {
  // MCPClient.tools is a read-only notification API, not a tool cache.
  try {
    const { tools, errors } = await client.mcp.listToolsWithErrors();
    const failures = Object.entries(errors);
    if (failures.length > 0) {
      throw new Error(
        failures.map(([name, message]) => `${name}: ${message}`).join('\n'),
      );
    }
    client.tools = tools;
    return tools;
  } catch (error) {
    client.tools = undefined;
    throw error;
  }
}
