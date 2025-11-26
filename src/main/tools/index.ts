import { ToolChannel } from '@/types/ipc-channel';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import mastraManager from '../mastra';
import { MastraMCPServerDefinition, MCPClient } from '@mastra/mcp';
import { appManager } from '../app';
import { McpEvent, McpClientStatus, CreateMcp } from '@/types/mcp';
import { nanoid } from '@/utils/nanoid';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Tools } from '@/entities/tools';
import { dbManager } from '../db';
import { In, Repository } from 'typeorm';
import { ToolType } from '@/types/tool';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { Bash } from '../mastra/tools/bash';
import { error } from 'console';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { PythonExecute } from './code/python-execute';
import BaseTool from './base-tool';
import { StreamTest } from './common/stream-test';
import { TodoWrite } from './common/todo-write';
import { FileSystem } from './file-system';
import BaseToolkit from './base-toolkit';
import { createTool } from '@mastra/core/tools';
import { AskUserQuestion } from './common/ask-user-question';
import { NodejsExecute } from './code/nodejs-execute';
import { Skill, skillManager } from './common/skill';
import { BashToolkit } from './file-system/bash';

interface BuiltInToolContext {
  tool: BaseTool;
  abortController: AbortController;
}

type BuiltInTool = Omit<BaseTool & BaseToolkit, 'id'> & {
  classType: any;
  id: `${ToolType.BUILD_IN}:${string}`;
};

class ToolsManager extends BaseManager {
  mcpClients: {
    mcp: MCPClient;
    status: McpClientStatus;
    error?: Error;
    id: string;
  }[];

  builtInTools: BuiltInTool[] = [];

  builtInToolContexts: BuiltInToolContext[] = [];

  toolsRepository: Repository<Tools>;

  constructor() {
    super();
  }

  pushMcpClient(id: string) {}

  async sendMcpClientUpdatedEvent(
    id: string,
    status: McpClientStatus,
    error?: Error,
  ) {
    await appManager.sendEvent(McpEvent.McpClientUpdated, {
      id,
      status,
      error,
    });
  }

  async registerBuiltInTool(classType, params?: any) {
    const parent = Object.getPrototypeOf(classType);
    let tool: BaseTool | BaseToolkit;
    let isToolkit;
    if (parent.name == BaseTool.name) {
      tool = new classType(params) as BaseTool;
      isToolkit = false;
    } else if (parent.name == BaseToolkit.name) {
      tool = new classType(params) as BaseToolkit;
      isToolkit = true;
    }
    let toolEntity = await this.toolsRepository.findOne({
      where: { id: `${ToolType.BUILD_IN}:${tool.id}` },
    });

    if (!toolEntity) {
      toolEntity = new Tools(
        `${ToolType.BUILD_IN}:${tool.id}`,
        tool.id,
        ToolType.BUILD_IN,
      );
      toolEntity.isActive = true;
      await this.toolsRepository.save(toolEntity);
    }

    if (!isToolkit) {
      const t = createTool(tool);
      this.builtInTools.push({
        ...t,
        isToolkit,
        classType,
        id: toolEntity.id,
      } as BuiltInTool);
    } else {
      const toolkit = tool as BaseToolkit;
      const tools = [];
      for (const tool of toolkit?.tools) {
        const t = createTool(tool);
        tools.push(t);
      }
      this.builtInTools.push({
        ...tool,
        isToolkit,
        classType,
        tools: tools,
        id: toolEntity.id,
      } as BuiltInTool);
    }
  }

  async registerBuiltInTools() {
    this.registerBuiltInTool(PythonExecute);
    this.registerBuiltInTool(NodejsExecute);
    this.registerBuiltInTool(StreamTest);
    this.registerBuiltInTool(TodoWrite);
    this.registerBuiltInTool(BashToolkit);
    this.registerBuiltInTool(FileSystem);
    this.registerBuiltInTool(AskUserQuestion);
    const skills = await skillManager.getClaudeSkills();
    this.registerBuiltInTool(Skill, {
      skills: skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
    });

    // this.registerBuiltInTool(
    //   new Skill({
    //     skills: skills.map((skill) => ({
    //       name: skill.name,
    //       description: skill.description,
    //       path: skill.path,
    //     })),
    //   }),
    // );
  }

  configToMastraMCPServerDefinition = (
    mcpConfig: CreateMcp,
  ): MastraMCPServerDefinition => {
    let servers: MastraMCPServerDefinition;
    if ('url' in mcpConfig) {
      servers = {
        url: new URL(mcpConfig.url),
        requestInit: {
          headers: mcpConfig.headers ?? {},
        },
      } as MastraMCPServerDefinition;
    } else if ('command' in mcpConfig) {
      servers = {
        command: mcpConfig.command,
        args: mcpConfig.args,
        env: mcpConfig.env,
      } as MastraMCPServerDefinition;
    }
    return servers;
  };

  async init(): Promise<void> {
    this.mcpClients = [];
    this.toolsRepository = dbManager.dataSource.getRepository(Tools);
    const mcpTools = await this.toolsRepository.find({
      where: { type: ToolType.MCP },
    });
    for (const tool of mcpTools) {
      const [key, value] = Object.entries(tool.mcpConfig)[0];
      const servers = this.configToMastraMCPServerDefinition(value);
      const mcp = new MCPClient({
        id: tool.id,
        servers: {
          [key]: servers,
        },
      });
      if (tool.isActive) {
        this.mcpClients.push({ id: tool.id, mcp, status: 'starting' });
      } else {
        this.mcpClients.push({ id: tool.id, mcp, status: 'stopped' });
      }
    }
    new Promise(async (resolve, reject) => {
      this.mcpClients.forEach(async (mcpClient) => {
        try {
          mcpClient.mcp.tools = await mcpClient.mcp.listTools();
          mcpClient.status = 'running';
        } catch (error: any) {
          mcpClient.status = 'error';
          mcpClient.error = error as Error;
        }
        await this.sendMcpClientUpdatedEvent(
          mcpClient.id,
          mcpClient.status,
          mcpClient.error,
        );
        resolve(null);
      });
    });

    this.registerBuiltInTools();
  }

  @channel(ToolChannel.ImportMCP)
  public async importMcp(data: string) {
    const config = JSON.parse(data);
    if (!('mcpServers' in config)) {
      throw new Error('Invalid config');
    }
    const mcpServers = config.mcpServers as [];

    if (Object.keys(mcpServers).length > 0) {
      const keys = Object.keys(mcpServers);
      const existingTools = await this.toolsRepository.find({
        where: { name: In(keys) },
      });
      if (existingTools.length > 0) {
        throw new Error(
          'Tools already exist: ' +
            existingTools.map((tool) => tool.name).join(', '),
        );
      }
    } else {
      throw new Error('Invalid config');
    }
    const [key, value] = Object.entries(mcpServers)[0];
    let servers = this.configToMastraMCPServerDefinition(value);

    const id = `${ToolType.MCP}:${nanoid()}`;
    const mcp = new MCPClient({
      id: id,
      servers: { [key]: servers as MastraMCPServerDefinition },
    });
    const mcpClient = {
      id: id,
      mcp,
      status: 'stopped' as McpClientStatus,
      error: undefined,
    };
    const mcpStatus = {
      id: id,
      status: 'stopped' as McpClientStatus,
      error: undefined,
    };

    this.mcpClients.push(mcpClient);
    await this.sendMcpClientUpdatedEvent(id, mcpStatus.status);
    try {
      const tool = new Tools(id, key, ToolType.MCP);
      tool.mcpConfig = {
        [key]: value,
      };
      await this.toolsRepository.save(tool);
    } catch (error: any) {
      mcpStatus.status = 'error';
      mcpStatus.error = error as Error;
      await this.sendMcpClientUpdatedEvent(
        id,
        mcpStatus.status,
        mcpStatus.error,
      );
    }
  }

  @channel(ToolChannel.GetMcp)
  public async getMcp(id: string) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP) {
      return tool.mcpConfig;
    }
    return null;
  }

  @channel(ToolChannel.DeleteTool)
  public async deleteTool(id: string) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP) {
      const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);
      if (mcp) {
        await mcp.mcp.disconnect();
      }
    }
    this.mcpClients = this.mcpClients.filter((x) => x.id !== id);
    await this.toolsRepository.delete(id);
  }

  @channel(ToolChannel.GetAvailableTools)
  public async getAvailableTools() {
    const tools = await this.toolsRepository.find({
      where: { isActive: true },
    });

    return {
      [ToolType.MCP]: tools
        .filter((tool) => tool.type === ToolType.MCP)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
        })),
      [ToolType.BUILD_IN]: tools
        .filter((tool) => tool.type === ToolType.BUILD_IN)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
        })),
      [ToolType.SKILL]: tools
        .filter((tool) => tool.type === ToolType.SKILL)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
        })),
    };
  }

  @channel(ToolChannel.GetList)
  public async getList(filter?: { type?: ToolType }) {
    const tools = await this.toolsRepository.find({
      where: { type: filter?.type },
    });
    const skills = await skillManager.getClaudeSkills();
    return {
      [ToolType.MCP]: tools
        .filter((tool) => tool.type === ToolType.MCP)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          status: this.mcpClients.find((x) => x.id == tool.id).status,
          description: tool.description,
          isActive: tool.isActive,
        })),
      [ToolType.SKILL]: skills.map((tool) => ({
        ...tool,
        status:
          tools.find((x) => x.id === tool.id)?.isActive == true
            ? 'running'
            : 'stopped',
        isActive: tools.find((x) => x.id === tool.id)?.isActive,
      })),
      [ToolType.BUILD_IN]: this.builtInTools.map((tool) => ({
        id: tool.id,
        name: tool.id.substring(ToolType.BUILD_IN.length + 1),
        description: tool.description,
        isActive: tools.find((x) => x.id === tool.id)?.isActive,
      })),
    };
  }

  @channel(ToolChannel.GetTool)
  public async getTool(id: string) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (id.startsWith(`${ToolType.SKILL}:`)) {
      const marketplace = id.split(':')[1];
      const skill = id.split(':').slice(2).join(':');
      const sk = await skillManager.getClaudeSkill(skill, marketplace);

      return {
        ...sk,
        isActive: tool?.isActive || false,
      };
    }

    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP) {
      const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);

      let version;
      let tools = {} as Record<string, any>;
      let resources;
      let prompts;
      if (tool.isActive) {
        if (!mcp.mcp.tools) {
          mcp.mcp.tools = await mcp.mcp.listTools();
        }
        tools = mcp.mcp.tools;

        version = mcp.mcp.mcpClientsById.get(tool.name)?.client?._serverVersion
          ?.version;
        // resources = await mcp.mcp.resources.list();
        // prompts = await mcp.mcp.prompts.list();
      }

      return {
        ...tool,
        status: mcp?.status,
        error: mcp?.error,
        // prompts,
        // resources,
        isToolkit: true,
        version,
        tools: Object.values(tools).map((t) => {
          return {
            id: t.id,
            name: t.id.substring(t.id.indexOf('_') + 1),
            description: t.description,
            inputSchema: zodToJsonSchema(t.inputSchema),
          };
        }),
      };
    } else if (tool.type === ToolType.BUILD_IN) {
      const _tool = this.builtInTools.find((x) => x.id === tool.id);
      if (!_tool?.isToolkit) {
        const __tool = _tool as BaseTool;
        return {
          ...tool,
          name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
          description: __tool?.description,
          isToolkit: false,
          tools: [
            {
              id: __tool.id,
              name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
              description: __tool.description,
              inputSchema: zodToJsonSchema(__tool.inputSchema),
            },
          ],
        };
      } else {
        const __tool = _tool as BaseToolkit;
        return {
          ...tool,
          name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
          description: __tool?.description,
          isToolkit: true,
          tools: __tool.tools.map((t) => {
            return {
              id: t.id,
              name: t.id,
              description: t.description,
              inputSchema: zodToJsonSchema(t.inputSchema),
            };
          }),
        };
      }
    }
    return tool;
  }

  @channel(ToolChannel.ToggleToolActive)
  public async toggleToolActive(id: string) {
    if (id.startsWith(`${ToolType.SKILL}:`)) {
      const marketplace = id.split(':')[1];
      const skill = id.split(':').slice(2).join(':');
      let tool = await this.toolsRepository.findOne({ where: { id } });
      if (!tool) {
        tool = new Tools(id, skill, ToolType.SKILL);
        tool.isActive = true;
      } else {
        tool.isActive = !tool.isActive;
        tool.name = skill;
      }
      await this.toolsRepository.save(tool);
      await this.sendMcpClientUpdatedEvent(
        id,
        tool.isActive ? 'running' : 'stopped',
        undefined,
      );
      return tool;
    } else {
      const tool = await this.toolsRepository.findOne({ where: { id } });
      if (tool.type == ToolType.MCP) {
        const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);
        if (mcp) {
          if (tool.isActive) {
            await mcp.mcp.disconnect();
            mcp.status = 'stopped';
            mcp.error = undefined;
          } else {
            await this.sendMcpClientUpdatedEvent(id, 'starting', undefined);
            try {
              const tools = await mcp.mcp.listTools();
              mcp.mcp.tools = tools;
              mcp.status = 'running';
              mcp.error = undefined;
            } catch (err) {
              mcp.status = 'error';
              mcp.error = err.message;
              await this.sendMcpClientUpdatedEvent(id, mcp.status, mcp.error);
              throw new Error('MCP client start failed');
            }
          }
        } else {
          throw new Error('MCP client not found');
        }
      } else if (tool.type == ToolType.BUILD_IN) {
      }
      tool.isActive = !tool.isActive;
      await this.toolsRepository.save(tool);
      // const toolRes = await this.getTool(id);
      await this.sendMcpClientUpdatedEvent(
        id,
        tool.isActive ? 'running' : 'stopped',
        undefined,
      );
      return tool;
    }
  }

  @channel(ToolChannel.ExecuteTool)
  public async executeTool(id: string, toolName: string, input: any) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP) {
      const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);
      if (mcp) {
        const tools = await mcp.mcp.listTools();
        const tool = tools[toolName];
        if (tool) {
          const res = await tool.execute?.(input);
          return res;
        }
      }
    } else if (tool.type === ToolType.BUILD_IN) {
      const buildInTool = this.builtInTools.find((x) => x.id === tool.id);

      const context = {
        tool: buildInTool as BaseTool,
        abortController: new AbortController(),
      };
      this.builtInToolContexts.push(context);
      let res;

      try {
        if (buildInTool && buildInTool.isToolkit === false) {
          res = await (buildInTool as BaseTool).execute?.(input, {
            abortSignal: context.abortController.signal,
          });
        } else if (buildInTool && buildInTool.isToolkit === true) {
          res = await (buildInTool as BaseToolkit).tools
            .find((x) => x.id == toolName)
            .execute?.(input, {
              abortSignal: context.abortController.signal,
            });
        }
      } catch (err) {
        throw err;
      } finally {
        this.builtInToolContexts = this.builtInToolContexts.filter(
          (x) => x.tool.id !== buildInTool.id,
        );
      }

      return res;
    }
  }
  @channel(ToolChannel.AbortTool)
  public async abortTool(id: string, toolName: string) {
    this.builtInToolContexts
      .find((x) => x.tool.id === id)
      ?.abortController?.abort();
  }

  buildTools(
    toolNames?: string[],
    config?: Record<`${ToolType.BUILD_IN}:${string}`, any>,
  ): Record<string, BaseTool> {
    if (!toolNames) return {};
    const tools = {};
    for (const toolName of toolNames) {
      const tool = this.builtInTools.find((x) => x.id === toolName);
      if (!tool) continue;
      if (!tool.isToolkit) {
        const newTool = new tool.classType(config?.[tool.id]) as BaseTool;
        const t = createTool({
          ...newTool,
          id: tool.id.substring(ToolType.BUILD_IN.length + 1),
        });

        tools[t.id] = t;
      } else {
        const newToolkit = new tool.classType(config?.[tool.id]) as BaseToolkit;
        for (const _tool of newToolkit.tools) {
          const t = createTool({
            ..._tool,
            id: _tool.id,
          });
          tools[t.id] = t;
        }
      }
    }
    return tools;
  }
}

export const toolsManager = new ToolsManager();
