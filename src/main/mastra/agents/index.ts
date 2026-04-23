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
import { SubAgentInfo } from '@/types/task';
import { Explore } from './explore-agent';
import { Plan } from './plan-agent';
import { stringify, parse as tomlParse } from 'smol-toml';
import { appManager } from '@/main/app';
import fs from 'fs';
import path from 'path';
import { getSkills } from '@/main/utils/skills';
import { formatCodeWithLineNumbers } from '@/main/utils/format';
import { isArray, isString } from '@/utils/is';
import { Agent as AgentTool } from '@/main/tools/common/agent';

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
    let { tools = [], subAgents = [], instructions } = params || {};

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
      !toolIds.includes(`${ToolType.BUILD_IN}:${AgentTool.toolName}`)
    ) {
      toolIds.push(`${ToolType.BUILD_IN}:${AgentTool.toolName}`);
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
      [`${ToolType.BUILD_IN}:${AgentTool.toolName}`]: {
        subAgents: subAgentsInfo,
      },
    });

    const storage = getStorage();

    let _instructions = instructions ?? builtInAgent?.instructions ?? agentEntity.instructions;


    const additionalInstructions = params?.requestContext?.get('additionalInstructions')
    if (isString(_instructions) && additionalInstructions) {
      _instructions = _instructions + `\n\n
<system-reminder>
${additionalInstructions}
</system-reminder>`;
    }


    const agent = new MastraAgent({
      id: builtInAgent?.id ?? agentEntity.id,
      name: builtInAgent?.name ?? agentEntity.name,
      instructions: _instructions ?? `You are a helpful assistant.`,
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
    const tools = [];
    for (const tool of agent?.tools ?? []) {
      if (tool.startsWith(`${ToolType.BUILD_IN}:`)) {
        const toolBuilded = await toolsManager.buildTool(tool);
        if (isArray(toolBuilded) && toolBuilded.length > 0) {
          tools.push(tool);
        } else if (!isArray(toolBuilded)) {
          tools.push(tool);
        }
      } else {
        tools.push(tool);
      }
    }
    return await this.agentsRepository.save({ ...agentEntity, ...agent, tools });
  }

  @channel(AgentChannel.GetAvailableAgents)
  public async getAvailableAgents(): Promise<Agent[]> {
    const agentEntities = await this.agentsRepository.find({
      where: { isActive: true },
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
    const tools = []
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
    for (const tool of agent.tools) {
      const skill = await toolsManager.getTool(tool);
      if (tool.startsWith(`${ToolType.SKILL}:`)) {
        if (skill?.source) {
          tools.push({
            id: skill.id,
            source: skill.source,
          });
        } else {

        }
      } else {
        tools.push({
          id: tool,
        });
      }
    }
    const tomlString = stringify({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      instructions: agent.instructions,
      tools: tools,
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

    const tools = [];
    for (const tool of data.tools as any[]) {
      const { id, source } = tool as { id: string, source?: string };
      if (id.startsWith(`${ToolType.SKILL}:`)) {
        const skill = await toolsManager.importSkills({
          repo_or_url: source,
          files: [],
          isActive: true,
        });
        if (skill.success) {
          tools.push(id);
        } else {
          throw new Error(skill.error);
        }
      } else {
        tools.push(id);
      }
    }
    const mcpServers = data.mcpServers as any || { mcpServers: {} };

    if (Object.keys(mcpServers).length > 0) {
      for (const [key, value] of Object.entries(mcpServers)) {
        const mcps = (await toolsManager.getList({ type: ToolType.MCP }))[ToolType.MCP];
        if (!mcps.find(x => x.name == key)) {
          await toolsManager.saveMCPServer(undefined, JSON.stringify({ mcpServers: { [key]: value } }));
        }
      }
    }




    agentEntity = new Agents(data.id as string, AgentType.CUSTOM);
    agentEntity.name = data.name as string;
    agentEntity.description = data.description as string;
    agentEntity.instructions = data.instructions as string;
    agentEntity.tools = tools as string[];
    agentEntity.subAgents = data.subAgents as string[];
    agentEntity.suggestions = data.suggestions as string[];
    agentEntity.tags = data.tags as string[];
    agentEntity.greeting = data.greeting as string;
    agentEntity.isActive = true;
    await this.agentsRepository.save(agentEntity);

    return agentEntity;
  }

  @channel(AgentChannel.GetDefaultAgent)
  public async getDefaultAgent(): Promise<Agent> {
    const appInfo = await appManager.getInfo();
    const defaultAgent = appInfo.defaultAgent;
    return await this.getAgent(defaultAgent);
  }
}

export const agentManager = new AgentManager();
