import { BaseManager } from '../../BaseManager';
import { Mastra } from '@mastra/core';
import { Agent as MastraAgent, AgentConfig } from '@mastra/core/agent';
import { Memory, MessageHistory } from '@mastra/memory';
import mastraManager from '../../mastra';
import { toolsManager } from '../../tools';
import { Skill, skillManager } from '../../tools/common/skill';
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
import { DefaultAgent } from './default-agent';
import { Task } from '@/main/tools/common/task';
import { SubAgentInfo } from '@/types/task';
import { Explore } from './explore-agent';
import { Plan } from './plan-agent';

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
    agentEntity.isHidden = agent.isHidden;
    agentEntity.description = await agent.description;

    await this.agentsRepository.save(agentEntity);

    this.builtInAgents.push({
      ...agent,
      classType,
    } as BuiltInAgent);
    // this.mastra.addAgent(agent);
  }

  async registerAgents() {
    await this.registerAgent(DefaultAgent);
    await this.registerAgent(CodeAgent);
    await this.registerAgent(Explore);
    await this.registerAgent(Plan);
  }

  async buildAgent(agentId?: string, params?: BuildAgentParams) {
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: agentId ?? DefaultAgent.name },
    });

    if (!agentEntity) {
      throw new Error('Agent not found');
    }
    let { tools = [], subAgents = [] } = params || {};

    let _skills = await skillManager.getClaudeSkills();
    _skills = _skills.filter((x) => tools.includes(x.id));

    const builtInAgent = this.builtInAgents.find((x) => x.id == agentId);

    subAgents = [
      ...new Set([...subAgents, ...(builtInAgent?.subAgents ?? [])]),
    ];

    let _subAgents = await agentManager.getList();
    const subAgentsInfo = _subAgents
      .filter((x) => x.isActive && subAgents.includes(x.id))
      .map((x) => {
        return {
          id: x.id,
          name: x.name,
          description: x.description,
          tools: x.tools,
        } as SubAgentInfo;
      });

    const toolIds = [
      ...new Set([
        ...(builtInAgent?.tools ?? []),
        ...(agentEntity.tools ?? []),
        ...tools,
      ]),
    ];
    if (
      subAgentsInfo.length > 0 &&
      !toolIds.includes(`${ToolType.BUILD_IN}:${Task.name}`)
    ) {
      toolIds.push(`${ToolType.BUILD_IN}:${Task.name}`);
    }
    if (
      _skills.length > 0 &&
      !toolIds.includes(`${ToolType.BUILD_IN}:${Skill.name}`)
    ) {
      toolIds.push(`${ToolType.BUILD_IN}:${Skill.name}`);
    }
    const _tools = await toolsManager.buildTools(toolIds, {
      [`${ToolType.BUILD_IN}:${Skill.name}`]: {
        skills: _skills,
      },
      [`${ToolType.BUILD_IN}:${Task.name}`]: {
        subAgents: subAgentsInfo,
      },
    });

    const storage = getStorage();

    const agent = new MastraAgent({
      id: builtInAgent?.id ?? agentEntity.id,
      name: builtInAgent?.name ?? agentEntity.name,
      instructions: builtInAgent?.instructions ?? agentEntity.instructions,
      description: builtInAgent?.description ?? agentEntity.description,

      model: await providersManager.getLanguageModel(
        params?.modelId ?? agentEntity.defaultModelId,
      ),
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
        builtInAgent?.instructions ?? agentEntity.instructions,
      ),
      type: agentEntity.type,
      tags: agentEntity.tags,
      isActive: agentEntity.isActive,
      tools: [
        ...new Set([
          ...(builtInAgent?.tools ?? []),
          ...(agentEntity.tools ?? []),
        ]),
      ],
      subAgents: [
        ...new Set([
          ...(builtInAgent?.subAgents ?? []),
          ...(agentEntity.subAgents ?? []),
        ]),
      ],
      defaultModelId: agentEntity.defaultModelId,
      suggestions: agentEntity.suggestions,
    };
  }
  @channel(AgentChannel.GetList)
  public async getList(): Promise<Agent[]> {
    const agentEntities = await this.agentsRepository.find();
    return agentEntities.map((agentEntity) => {
      const builtInAgent = this.builtInAgents.find(
        (x) => x.id == agentEntity.id,
      );
      return {
        id: agentEntity.id,
        name: agentEntity.name,
        description: agentEntity.description,
        tags: agentEntity.tags,
        isActive: agentEntity.isActive,
        tools: [
          ...new Set([
            ...(builtInAgent?.tools ?? []),
            ...(agentEntity.tools ?? []),
          ]),
        ],
        isHidden: agentEntity.isHidden,
      };
    });
  }

  @channel(AgentChannel.SaveAgent)
  public async saveAgent(agent: Agent): Promise<Agent> {
    let agentEntity;
    if (agent.id) {
      agentEntity = await this.agentsRepository.findOne({
        where: { id: agent.id },
      });
      if (!agentEntity) {
        agentEntity = new Agents(agent.id, AgentType.CUSTOM);
      }
    } else {
      agentEntity = new Agents(agent.id, AgentType.CUSTOM);
    }
    return await this.agentsRepository.save({ ...agentEntity, ...agent });
  }

  @channel(AgentChannel.GetAvailableAgents)
  public async getAvailableAgents(): Promise<Agent[]> {
    const agentEntities = await this.agentsRepository.find({
      where: { isActive: true, isHidden: false },
    });
    return agentEntities.map((agentEntity) => {
      const builtInAgent = this.builtInAgents.find(
        (x) => x.id == agentEntity.id,
      );
      return {
        id: agentEntity.id,
        name: agentEntity.name,
        description: agentEntity.description,
        tags: agentEntity.tags,
        isActive: agentEntity.isActive,
        tools: [
          ...new Set([
            ...(builtInAgent?.tools ?? []),
            ...(agentEntity.tools ?? []),
          ]),
        ],
        subAgents: [
          ...new Set([
            ...(builtInAgent?.subAgents ?? []),
            ...(agentEntity.subAgents ?? []),
          ]),
        ],
        defaultModelId: agentEntity.defaultModelId,
        suggestions: agentEntity.suggestions,
      };
    });
  }

  @channel(AgentChannel.DeleteAgent)
  public async deleteAgent(id: string): Promise<void> {
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: id },
    });
    if (!agentEntity) {
      throw new Error('Agent not found');
    }
    if (agentEntity.type !== AgentType.CUSTOM) {
      throw new Error('Only custom agents can be deleted');
    }
    await this.agentsRepository.delete(id);
  }

  @channel(AgentChannel.GetAgentConfig)
  public async getAgentConfig(id: string): Promise<string> {
    const agent = await this.getAgent(id);
    return `
id: ${agent.id}
name: ${agent.name}
description: ${agent.description}
instructions: ${agent.instructions}
tools:
  ${agent.tools?.map((x) => `- ${x}`).join('\n')}
subAgents:
  ${agent.subAgents?.map((x) => `- ${x}`).join('\n')}
suggestions:
  ${agent.suggestions?.map((x) => `- ${x}`).join('\n')}
`;
  }
}

export const agentManager = new AgentManager();
