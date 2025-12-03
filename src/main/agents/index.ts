import { BaseManager } from '../BaseManager';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import mastraManager from '../mastra';
import { toolsManager } from '../tools';
import { skillManager } from '../tools/common/skill';
import { ToolType } from '@/types/tool';
import { BuildAgentParams } from '@/types/agent';
import { providersManager } from '../providers';
import { Memory, MessageHistory } from '@mastra/memory';
import { getStorage, getVectorStore } from '../mastra/storage';

class AgentManager extends BaseManager {
  mastra: Mastra;

  async init() {
    console.log('AgentManager initialized');
    this.mastra = mastraManager.mastra;
  }

  async buildAgent(agentId?: string, params?: BuildAgentParams) {
    const mastraAgent = this.mastra.getAgentById(agentId || 'react-agent');

    const { tools } = params || {};
    if (!mastraAgent) {
      throw new Error('Agent not found');
    }

    let _skills = await skillManager.getClaudeSkills();
    _skills = _skills.filter((x) => tools.includes(x.id));

    const _tools = await toolsManager.buildTools(tools, {
      [`${ToolType.BUILD_IN}:Skill`]: {
        skills: _skills,
      },
    });

    const storage = getStorage();

    const agent = new Agent({
      id: mastraAgent.id,
      name: mastraAgent.name,
      instructions: 'You are a helpful assistant.',
      model: await providersManager.getLanguageModel(params.modelId),
      memory: new Memory({
        storage: storage,
        options: {
          generateTitle: false,
          semanticRecall: false,
          workingMemory: {
            enabled: false,
          },
          lastMessages: false,
        },
        vector: getVectorStore(),
      }),
      outputProcessors({ requestContext, mastra }) {
        return [
          new MessageHistory({
            storage: storage.stores.memory,
            // lastMessages: false,
          }),
        ];
      },
      tools: _tools,
      mastra: this.mastra,
    });

    return agent;
  }
}

export const agentManager = new AgentManager();
