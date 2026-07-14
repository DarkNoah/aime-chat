import fs from 'fs';
import path from 'path';
import { MarketChannel } from '@/types/market';
import { ToolType } from '@/types/tool';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { toolsManager } from '../tools';
import { getAssetPath } from '../utils';
import {
  discoverMarketSkillPackages,
  type MarketSkillPackage,
} from './skill-packages';

export class MarketManager extends BaseManager {
  async init(): Promise<void> {
    await this.autoInstall();
  }

  private async installSkill(skill: MarketSkillPackage) {
    const commonOptions = {
      isActive: true,
      // `null` means an explicitly ungrouped market skill. `undefined` is
      // reserved for regular imports, which still group GitHub skills by repo.
      group: skill.group ?? null,
    };

    if (skill.url) {
      return toolsManager.importSkills({
        ...commonOptions,
        repo_or_url: skill.url,
      });
    }

    if (skill.packageType === 'archive') {
      return toolsManager.importSkills({
        ...commonOptions,
        files: [skill.packagePath],
      });
    }

    return toolsManager.importSkills({
      ...commonOptions,
      dirs: [skill.packagePath],
    });
  }

  async autoInstall() {
    const marketPath = getAssetPath('market', ToolType.SKILL);
    const skills = await discoverMarketSkillPackages(marketPath);

    for (const skill of skills) {
      if (!skill.autoInstall) continue;

      try {
        const result = await this.installSkill(skill);
        if (result?.success === false) {
          console.error(
            `Failed to install market skill ${skill.name}:`,
            result.error,
          );
        } else {
          console.log(`Skill ${skill.name} installed`);
        }
      } catch (error) {
        console.error(`Failed to install market skill ${skill.name}:`, error);
      }
    }
  }

  @channel(MarketChannel.GetMarketData)
  public async getMarketData(type: ToolType.SKILL | ToolType.MCP) {
    const marketPath = getAssetPath('market', type);
    const tools = (await toolsManager.getList())[type];

    if (type === ToolType.SKILL) {
      const skills = await discoverMarketSkillPackages(marketPath);

      return skills.map((skill) => {
        const { packagePath, packageType, ...metadata } = skill;
        const installedTool = tools.find(
          (tool) =>
            tool.id === `${ToolType.SKILL}:local:${skill.id}` ||
            tool.id === `${ToolType.SKILL}:${skill.id}` ||
            tool.name === skill.name,
        );

        return {
          ...metadata,
          id: installedTool?.id ?? `${ToolType.SKILL}:local:${skill.id}`,
          isInstalled: Boolean(installedTool),
          path: packageType === 'directory' ? packagePath : undefined,
          file: packageType === 'archive' ? packagePath : undefined,
        };
      });
    }

    const list = await fs.promises.readdir(marketPath, {
      withFileTypes: true,
    });
    const marketData = [];

    for (const item of list) {
      const file = path.join(marketPath, item.name);
      if (item.isDirectory() || !file.endsWith('.json')) continue;

      try {
        const data = await fs.promises.readFile(file, 'utf-8');
        const toolData = JSON.parse(data) as {
          name: string;
          description: string;
          mcpServers: Record<string, unknown>;
        };
        const tool = tools.find(
          (candidate) => candidate.name === toolData.name,
        );

        marketData.push({
          ...(tool ? { id: tool.id } : {}),
          ...toolData,
          isInstalled: Boolean(tool),
        });
      } catch (error) {
        console.error(`Failed to read market item: ${file}`, error);
      }
    }

    return marketData;
  }
}

export const marketManager = new MarketManager();
