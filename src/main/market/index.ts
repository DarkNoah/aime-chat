import path from "path";
import { BaseManager } from "../BaseManager";
import { toolsManager } from "../tools";
import { getAssetPath } from "../utils";
import fs from 'fs';
import { channel } from "../ipc/IpcController";
import { MarketChannel } from "@/types/market";
import { ToolType } from "@/types/tool";
import matter from "gray-matter";
export class MarketManager extends BaseManager {

  constructor() {
    super();
  }

  async init(): Promise<void> {
    await this.autoInstall();
  }

  async autoInstall() {
    const marketPath = getAssetPath('market', ToolType.SKILL);
    const files = await fs.promises.readdir(marketPath);
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const data = await fs.promises.readFile(path.join(marketPath, file), 'utf-8');
        const toolData = JSON.parse(data) as {
          name: string;
          description: string;
          autoInstall: boolean;
          url?: string;
        }
        let skillfile = path.join(marketPath, path.basename(file, '.json')) + '.skill';
        if (!fs.existsSync(skillfile)) {
          skillfile = path.join(marketPath, path.basename(file, '.json')) + '.zip';
        }
        if (toolData.autoInstall !== true) {
          continue;
        }
        if (toolData.url) {
          const result = await toolsManager.importSkills({
            repo_or_url: toolData.url,
            isActive: true
          });
        } else if (fs.existsSync(skillfile)) {
          const result = await toolsManager.importSkills({
            files: [skillfile],
            isActive: true
          });
          console.log(`Skill ${toolData.name} installed`);
        }



      } catch {

      }

    }
  }



  @channel(MarketChannel.GetMarketData)
  public async getMarketData(type: ToolType.SKILL | ToolType.MCP) {
    const marketPath = getAssetPath('market', type);
    const list = await fs.promises.readdir(marketPath, {
      withFileTypes: true,
    });
    const toolsList = await toolsManager.getList();
    const tools = (await toolsManager.getList())[type];
    const marketData = []
    for (const item of list) {
      try {
        if (item.isDirectory() && type == ToolType.SKILL) {

          const skillMdPath = path.join(marketPath, item.name, 'SKILL.md');
          const skillMd = await fs.promises
            .readFile(skillMdPath, 'utf-8')
            .catch(() => '');
          const data = matter(skillMd);
          const id = `${ToolType.SKILL}:local:${item.name}`
          const tool = tools.find((t) => t.id === id);
          marketData.push({
            id: id,
            name: data.data.name,
            description: data.data.description,
            isInstalled: tool ? true : false,
            path: path.join(marketPath, item.name),
          });

        } else {
          const file = path.join(marketPath, item.name);
          if (!file.endsWith('.json')) {
            continue;
          }
          const data = await fs.promises.readFile(file, 'utf-8');
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
      } catch {

      }
    }

    return marketData;
  }
}

export const marketManager = new MarketManager();
