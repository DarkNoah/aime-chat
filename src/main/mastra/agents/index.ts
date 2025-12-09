import { BaseManager } from '../../BaseManager';
import { Mastra } from '@mastra/core';
import { Agent as MastraAgent, AgentConfig } from '@mastra/core/agent';
import { Memory, MessageHistory } from '@mastra/memory';
import mastraManager from '../../mastra';
import { toolsManager } from '../../tools';
import { skillManager } from '../../tools/common/skill';
import { ToolType } from '@/types/tool';
import { Agent, AgentType, BuildAgentParams } from '@/types/agent';
import { providersManager } from '../../providers';
import { getStorage, getVectorStore } from '../../mastra/storage';
import { AgentChannel } from '@/types/ipc-channel';
import { channel } from '@/main/ipc/IpcController';
import { CodeAgent } from './code-agent';
import { Agents } from '@/entities/agents';
import { Repository } from 'typeorm';
import { BaseAgent } from './base-agent';
import { convertToInstructionContent } from '@/main/utils/convertToCoreMessages';
import { dbManager } from '@/main/db';

type BuiltInAgent = BaseAgent & {
  classType: any;
};

class AgentManager extends BaseManager {
  mastra: Mastra;

  builtInAgents: BuiltInAgent[] = [];

  agentsRepository: Repository<Agents>;

  async init() {
    console.log('AgentManager initialized');
    this.agentsRepository = dbManager.dataSource.getRepository(Agents);
    this.mastra = mastraManager.mastra;
    await this.registerAgents();
  }

  async registerAgent(classType, params?: AgentConfig) {
    const parent = Object.getPrototypeOf(classType);
    const agent = new classType(params) as BaseAgent;

    let agentEntity = await this.agentsRepository.findOne({
      where: { id: agent.id },
    });

    if (!agentEntity) {
      agentEntity = new Agents(agent.id, AgentType.BUILD_IN);
    }
    agentEntity.name = agent.name;
    agentEntity.description = await agent.description;

    await this.agentsRepository.save(agentEntity);

    this.builtInAgents.push({
      ...agent,
      classType,
    } as BuiltInAgent);
    // this.mastra.addAgent(agent);
  }

  async registerAgents() {
    await this.registerAgent(CodeAgent);
  }

  async buildAgent(agentId?: string, params?: BuildAgentParams) {
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: agentId },
    });

    if (!agentEntity) {
      throw new Error('Agent not found');
    }

    // const mastraAgent = this.mastra.getAgentById(agentId || 'react-agent');

    const { tools } = params || {};
    // if (!mastraAgent) {
    //   throw new Error('Agent not found');
    // }

    let _skills = await skillManager.getClaudeSkills();
    _skills = _skills.filter((x) => tools.includes(x.id));

    const builtInAgent = this.builtInAgents.find((x) => x.id == agentId);
    const _tools = await toolsManager.buildTools(builtInAgent.tools, {
      [`${ToolType.BUILD_IN}:Skill`]: {
        skills: _skills,
      },
    });

    const storage = getStorage();

    const agent = new MastraAgent({
      id: builtInAgent.id,
      name: builtInAgent.name,
      instructions: builtInAgent.instructions,
      description: builtInAgent.description,

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
  @channel(AgentChannel.GetAgent)
  public async getAgent(id: string): Promise<Agent> {
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: id },
    });
    if (!agentEntity) {
      throw new Error('Agent not found');
    }
    const builtInAgent = this.builtInAgents.find((x) => x.id == agentEntity.id);
    return {
      id: agentEntity.id,
      name: agentEntity.name,
      description: agentEntity.description,
      instructions: await convertToInstructionContent(
        builtInAgent.instructions,
      ),
      tags: agentEntity.tags,
      isActive: agentEntity.isActive,
      tools: builtInAgent.tools,
    };
  }
  @channel(AgentChannel.GetList)
  public async getList(): Promise<Agent[]> {
    const agentEntities = await this.agentsRepository.find();
    return agentEntities.map((agentEntity) => ({
      id: agentEntity.id,
      name: agentEntity.name,
      description: agentEntity.description,
      tags: agentEntity.tags,
      isActive: agentEntity.isActive,
      tools: this.builtInAgents.find((x) => x.id == agentEntity.id)?.tools,
    }));
  }

  @channel(AgentChannel.UpdateAgent)
  public async update(agent: Agent): Promise<Agent> {
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: agent.id },
    });
    if (!agentEntity) {
      throw new Error('Agent not found');
    }

    await this.agentsRepository.save({ ...agentEntity, ...agent });
    return agent;
  }
  @channel(AgentChannel.GetAvailableAgents)
  public async getAvailableAgents(): Promise<Agent[]> {
    const agentEntities = await this.agentsRepository.find({
      where: { isActive: true },
    });
    return agentEntities.map((agentEntity) => ({
      id: agentEntity.id,
      name: agentEntity.name,
      description: agentEntity.description,
      tags: agentEntity.tags,
      isActive: agentEntity.isActive,
      tools: this.builtInAgents.find((x) => x.id == agentEntity.id)?.tools,
    }));
  }
}

export const agentManager = new AgentManager();
