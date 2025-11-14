import { ToolChannel } from '@/types/ipc-channel';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import mastraManager from '../mastra';
import { MCPClient } from '@mastra/mcp';

class ToolsManager extends BaseManager {
  mcpClients: MCPClient[];
  constructor() {
    super();
  }

  async init(): Promise<void> {
    this.mcpClients = [];
  }

  @channel(ToolChannel.ImportMCP)
  public async importMcp(data: any) {
    const testMcpClient = new MCPClient({
      id: 'test-mcp-client',
      servers: {
        wikipedia: {
          command: 'npx',
          args: ['-y', 'wikipedia-mcp'],
        },
      },
    });
  }

  public async getMcpClients() {}
}

export const toolsManager = new ToolsManager();
