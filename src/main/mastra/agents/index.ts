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
import { stringify, parse as tomlParse } from 'smol-toml';
import { appManager } from '@/main/app';
import fs from 'fs';
import path from 'path';
import { getSkills } from '@/main/utils/skills';
import { formatCodeWithLineNumbers } from '@/main/utils/format';
import { isString } from '@/utils/is';

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
    const _agentId = agentId ?? DefaultAgent.agentName;
    const agentEntity = await this.agentsRepository.findOne({
      where: { id: _agentId },
    });

    if (!agentEntity) {
      throw new Error('Agent not found');
    }
    let { tools = [], subAgents = [] } = params || {};

    let _skills = []; //await skillManager.getClaudeSkills();

    for (const tool of tools.filter((x) =>
      x.startsWith(`${ToolType.SKILL}:`),
    )) {
      const skill = await skillManager.getSkill(
        tool as `${ToolType.SKILL}:${string}`,
      );
      if (skill) {
        _skills.push(skill);
      }
    }

    const workspace = params?.requestContext?.get('workspace');
    if (
      workspace &&
      fs.existsSync(workspace) &&
      fs.statSync(workspace).isDirectory()
    ) {
      const skillsPath = path.join(workspace, '.aime-chat', 'skills');
      if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) {
        // const skills = await fs.promises.readdir(skillsPath);
        const skills = await getSkills(skillsPath);
        for (const skill of skills) {
          if (_skills.map((x) => x.id).includes(skill.id)) {
            _skills = _skills.filter((x) => x.id !== skill.id);
          }
          _skills.push(skill);
        }
      }
    }

    // _skills = _skills.filter((x) => tools.includes(x.id));

    const builtInAgent = this.builtInAgents.find((x) => x.id == _agentId);

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
      !toolIds.includes(`${ToolType.BUILD_IN}:${Task.toolName}`)
    ) {
      toolIds.push(`${ToolType.BUILD_IN}:${Task.toolName}`);
    }
    if (
      _skills.length > 0 &&
      !toolIds.includes(`${ToolType.BUILD_IN}:${Skill.toolName}`)
    ) {
      toolIds.push(`${ToolType.BUILD_IN}:${Skill.toolName}`);
    }
    const _tools = await toolsManager.buildTools(toolIds, {
      [`${ToolType.BUILD_IN}:${Skill.toolName}`]: {
        skills: _skills,
      },
      [`${ToolType.BUILD_IN}:${Task.toolName}`]: {
        subAgents: subAgentsInfo,
      },
    });

    const storage = getStorage();

    let instructions = builtInAgent?.instructions ?? agentEntity.instructions;


    const additionalInstructions = params?.requestContext?.get('additionalInstructions')
    if (isString(instructions) && additionalInstructions) {
      instructions = instructions + `\n\n
<system-reminder>
${additionalInstructions}
</system-reminder>`;
    }


    const agent = new MastraAgent({
      id: builtInAgent?.id ?? agentEntity.id,
      name: builtInAgent?.name ?? agentEntity.name,
      instructions: instructions,
      description: builtInAgent?.description ?? agentEntity.description,
      model: await providersManager.getLanguageModel(params?.modelId),
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
      ...agentEntity,
      instructions: await convertToInstructionContent(
        builtInAgent?.instructions ?? agentEntity.instructions,
      ),
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
        ...agentEntity,
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

    const mcpServers = {};
    toolsManager;
    for (const mcpServer of agent.tools.filter((x) =>
      x.startsWith(`${ToolType.MCP}:`),
    )) {
      const mcps = (await toolsManager.getList({ type: ToolType.MCP }))[
        ToolType.MCP
      ];
      let mcp = mcps.find((x) =>
        mcpServer.startsWith(`${ToolType.MCP}:${x.name}_`),
      );
      if (mcp) {
        const mcpConfig = await toolsManager.getMcp(mcp.id);
        const [key, value] = Object.entries(mcpConfig)[0];
        mcpServers[key] = value;
      }
    }
    const tomlString = stringify({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      tools: agent.tools,
      subAgents: agent.subAgents,
      suggestions: agent.suggestions,
      tags: agent.tags,
      greeting: agent.greeting,
      mcpServers: mcpServers,
    });
    return tomlString;
  }
  @channel(AgentChannel.ImportAgent)
  public async importAgent(content: string): Promise<Agent> {
    const data = tomlParse(content);
    let agentEntity = await this.agentsRepository.findOne({
      where: { id: data.id as string },
    });
    if (agentEntity) {
      throw new Error('Agent already exists');
    }
    agentEntity = new Agents(data.id as string, AgentType.CUSTOM);
    agentEntity.name = data.name as string;
    agentEntity.description = data.description as string;
    agentEntity.instructions = data.instructions as string;
    agentEntity.tools = data.tools as string[];
    agentEntity.subAgents = data.subAgents as string[];
    agentEntity.suggestions = data.suggestions as string[];
    agentEntity.tags = data.tags as string[];
    agentEntity.greeting = data.greeting as string;
    agentEntity.isActive = true;
    await this.agentsRepository.save(agentEntity);

    return agentEntity;
  }
}

export const agentManager = new AgentManager();
