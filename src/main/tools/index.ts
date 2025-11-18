import { ToolChannel } from '@/types/ipc-channel';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import mastraManager from '../mastra';
import { MCPClient } from '@mastra/mcp';
import { appManager } from '../app';
import { McpEvent, McpClientStatus } from '@/types/mcp';
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
import {FileSystem } from './file-system'
import BaseToolkit from './base-toolkit';



class ToolsManager extends BaseManager {
  mcpClients: {
    mcp: MCPClient;
    status: McpClientStatus;
    error?: Error;
    id: string;
  }[];

  builtInTools: BaseTool[] | BaseToolkit[] = [];

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

  async registerBuiltInTool(tool: BaseTool | BaseToolkit) {
    let toolEntity = await this.toolsRepository.findOne({
      where: { id: `${ToolType.BUILD_IN}:${tool.id}` },
    });
    const isToolkit = tool?.tools?.length > 0;
    if (!toolEntity) {
      toolEntity = new Tools(
        `${ToolType.BUILD_IN}:${tool.id}`,
        tool.id,
        ToolType.BUILD_IN,
      );
      toolEntity.isActive = true;
      await this.toolsRepository.save(toolEntity);
    }
    this.builtInTools.push({...tool,id: toolEntity.id} as BaseTool & BaseToolkit);
    // if (!isToolkit) {

    // } else {


    // }

  }

  async registerBuiltInTools() {
    this.registerBuiltInTool(new PythonExecute());
    this.registerBuiltInTool(new StreamTest());
    this.registerBuiltInTool(new TodoWrite());
    this.registerBuiltInTool(new FileSystem());
  }

  async init(): Promise<void> {
    this.mcpClients = [];
    this.toolsRepository = dbManager.dataSource.getRepository(Tools);
    const mcpTools = await this.toolsRepository.find({
      where: { type: ToolType.MCP },
    });
    for (const tool of mcpTools) {
      const mcp = new MCPClient({
        id: tool.id,
        servers: tool.mcpConfig,
      });
      if (tool.isActive) {
        this.mcpClients.push({ id: tool.id, mcp, status: 'starting' });
      } else {
        this.mcpClients.push({ id: tool.id, mcp, status: 'stopped' });
      }
    }
    new Promise(async (resolve,reject) => {
      this.mcpClients.forEach(async (mcpClient) => {
        try {
          await mcpClient.mcp.getTools();
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
    })

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

    const id = nanoid();
    const mcp = new MCPClient({
      id: id,
      servers: {
        [key]: value,
      },
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
    const skills = await this.getClaudeSkills();
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
        name: tool.id.substring(ToolType.BUILD_IN.length +1),
        description: tool.description,
        isActive: tools.find((x) => x.id === tool.id)?.isActive,
      })),
    };
  }

  @channel(ToolChannel.GetTool)
  public async getTool(id: string) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (id.startsWith('claude-skill:')) {
      const marketplace = id.split(':')[1];
      const skill = id.split(':')[2];
      const sk = await this.getClaudeSkill(skill, marketplace);

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
        tools = tool.isActive ? await mcp.mcp.getTools() : [];
        const elicitation = await mcp.mcp.elicitation;
        version = mcp.mcp.mcpClientsById.get(tool.name)?.client?._serverVersion
          ?.version;
        resources = await mcp.mcp.resources.list();
        prompts = await mcp.mcp.prompts.list();
      }

      return {
        ...tool,
        status: mcp?.status,
        error: mcp?.error,
        prompts,
        resources,
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
      const _tool = this.builtInTools.find((x) => x.id === tool.id );
      if(!_tool?.isToolkit) {
        const __tool = _tool as BaseTool;
        return {
          ...tool,
          name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
          description: __tool?.description,
          tools: [
            {
              id: __tool.id,
              name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
              description: __tool.description,
              inputSchema: zodToJsonSchema(__tool.inputSchema),
            },
          ],
        };
      }else {
        const __tool = _tool as BaseToolkit;
        return {
          ...tool,
          name: __tool.id.substring(ToolType.BUILD_IN.length + 1),
          description: __tool?.description,
          tools: __tool.tools.map(t => {
            return {
              id: t.id,
              name: t.id,
              description: t.description,
              inputSchema: zodToJsonSchema(t.inputSchema)
            }
          })
        };


      }

    }
    return tool;
  }

  @channel(ToolChannel.ToggleToolActive)
  public async toggleToolActive(id: string) {
    if (id.startsWith('claude-skill:')) {
      const marketplace = id.split(':')[1];
      const skill = id.split(':')[2];
      let tool = await this.toolsRepository.findOne({ where: { id } });
      if (!tool) {
        tool = new Tools(id, skill, ToolType.SKILL);
        tool.isActive = true;
      } else {
        tool.isActive = !tool.isActive;
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
              const tools = await mcp.mcp.getTools();
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
        const tools = await mcp.mcp.getTools();
        const tool = tools[toolName];
        if (tool) {
          const res = await tool.execute?.({ context: input });
          return res;
        }
      }
    }
    else if (tool.type === ToolType.BUILD_IN) {
      const buildInTool = this.builtInTools.find((x) => x.id === tool.id);
      if (buildInTool && buildInTool.isToolkit === false) {
        const res = await (buildInTool as BaseTool).execute?.({ context: input,runtimeContext:undefined });
        return res;
      }else if(buildInTool && buildInTool.isToolkit === true){
        const res = await (buildInTool as BaseToolkit).tools.find(x=>x.id == toolName).execute?.({ context: input,runtimeContext:undefined });
        return res;
      }
    }
  }
  @channel(ToolChannel.AbortTool)
  public async abortTool(id: string, toolName:string) {

  }




  async getClaudeSkills() {
    const marketplaces = path.join(
      app.getPath('home'),
      '.claude',
      'plugins',
      'marketplaces',
    );
    if (
      !(fs.existsSync(marketplaces) && fs.statSync(marketplaces).isDirectory())
    ) {
      return [];
    }
    const marketplaceDir = fs.readdirSync(marketplaces);
    const skillList = [];
    for (const marketplace of marketplaceDir) {
      try {
        const mds = await fg('**/SKILL.md', {
          cwd: path.join(marketplaces, marketplace),
          absolute: true,
        });
        for (const md of mds) {
          const skillPath = path.dirname(md);
          const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
          const data = matter(skillMD);
          const skill = {
            id: `claude-skill:${marketplace}:${data.data.name}`,
            name: data.data.name,
            description: data.data.description,
            isActive: false,
          };
          skillList.push(skill);
        }
      } catch {}
    }

    return skillList;
  }

  async getClaudeSkill(id: string, marketplace: string) {
    const marketplaces = path.join(
      app.getPath('home'),
      '.claude',
      'plugins',
      'marketplaces',
    );
    if (
      !(fs.existsSync(marketplaces) && fs.statSync(marketplaces).isDirectory())
    ) {
      return undefined;
    }
    const mds = await fg(`${marketplace}/**/${id}/SKILL.md`, {
      cwd: marketplaces,
      absolute: true,
    });
    if (mds.length === 1) {
      const md = mds[0];
      const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
      const data = matter(skillMD);
      return {
        id: `claude-skill:${marketplace}:${data.data.name}`,
        name: data.data.name,
        description: data.data.description,
        content: data.content,
        path: path.dirname(md),
        type: ToolType.SKILL,
        isActive: false,
      };
    } else {
      return undefined;
    }
  }
}

export const toolsManager = new ToolsManager();
