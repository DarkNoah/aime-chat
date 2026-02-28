import path from "path";
import { BaseManager } from "../BaseManager";
import { toolsManager } from "../tools";
import { getAssetPath } from "../utils";
import fs from 'fs';
import { channel } from "../ipc/IpcController";
import { MarketChannel } from "@/types/market";
import { ToolType } from "@/types/tool";
export class MarketManager extends BaseManager {

  constructor() {
    super();
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  @channel(MarketChannel.GetMarketData)
  public async getMarketData(type: ToolType.SKILL | ToolType.MCP) {
    const marketPath = getAssetPath('market', type);
    const files = await fs.promises.readdir(marketPath);
    const toolsList = await toolsManager.getList();
    const tools = (await toolsManager.getList())[type];
    const marketData = []
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const data = await fs.promises.readFile(path.join(marketPath, file), 'utf-8');
      const toolData = JSON.parse(data) as {
        name: string;
        description: string;
        mcpServers: Record<string, any>;
      };

      const tool = tools.find((t) => t.name === toolData.name);
      if (tool) {
        marketData.push({ id: tool.id, ...toolData, isInstalled: true });
      } else {
        marketData.push({
          ...toolData,
          isInstalled: false,
        });
      }

    }

    return marketData;
  }
}

export const marketManager = new MarketManager();
