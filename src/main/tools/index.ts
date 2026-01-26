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
import { In, IsNull, Not, Repository } from 'typeorm';
import { AvailableTool, Tool, ToolEvent, ToolType } from '@/types/tool';
import { zodToJsonSchema } from 'zod-to-json-schema';
import BaseTool from './base-tool';
import { StreamTest } from './test/stream-test';
import { TodoWrite } from './common/todo-write';
import { FileSystem } from './file-system';
import BaseToolkit from './base-toolkit';
import { createTool } from '@mastra/core/tools';
import { AskUserQuestion } from './common/ask-user-question';
import { NodejsExecute } from './code/nodejs-execute';
import { Skill, skillManager } from './common/skill';
import { BashToolkit } from './file-system/bash';
import { SendEvent } from './common/send-event';
import { WebSearch } from './web/web-search';
import { RemoveBackground } from './image/rmbg';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { z, ZodSchema } from 'zod';
import { isArray, isObject, isString, isUrl } from '@/utils/is';
import { CodeExecution } from './code/code-execution';
import ExpenseManagementToolkit from './test/expense_management';
import ToolToolkit from './common/tool';
import { Vision } from './vision/vision';
import MemoryToolkit from './memory/memory';
import { Task } from './common/task';
import { WebFetch } from './web/web-fetch';
import { Extract } from './work/extract';
import { GenerateImage } from './image/generate-image';
import { EditImage } from './image/edit-image';
import { Translation } from './work/translation';
import { runCommand } from '../utils/shell';
import os from 'os';
import matter from 'gray-matter';
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

  mcpServer: McpServer;

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
    if (parent.toolName == BaseTool.toolName) {
      tool = new classType(params) as BaseTool;
      isToolkit = false;
    } else if (parent.toolName == BaseToolkit.toolName) {
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

        let childToolEntity = await this.toolsRepository.findOne({
          where: { id: `${ToolType.BUILD_IN}:${tool.id}` },
        });

        if (!childToolEntity) {
          childToolEntity = new Tools(
            `${ToolType.BUILD_IN}:${tool.id}`,
            tool.id,
            ToolType.BUILD_IN,
          );
          childToolEntity.isActive = true;
        }
        childToolEntity.toolkitId = toolEntity.id;
        await this.toolsRepository.save(childToolEntity);
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
    // this.registerBuiltInTool(PythonExecute);
    await this.registerBuiltInTool(NodejsExecute);
    await this.registerBuiltInTool(CodeExecution);
    await this.registerBuiltInTool(TodoWrite);
    await this.registerBuiltInTool(BashToolkit);
    await this.registerBuiltInTool(FileSystem);
    await this.registerBuiltInTool(AskUserQuestion);
    await this.registerBuiltInTool(SendEvent);
    await this.registerBuiltInTool(WebSearch);
    await this.registerBuiltInTool(WebFetch);
    await this.registerBuiltInTool(RemoveBackground);
    await this.registerBuiltInTool(Vision);
    await this.registerBuiltInTool(ToolToolkit);
    await this.registerBuiltInTool(GenerateImage);
    await this.registerBuiltInTool(EditImage);
    await this.registerBuiltInTool(Task);
    await this.registerBuiltInTool(MemoryToolkit);
    await this.registerBuiltInTool(Extract);
    await this.registerBuiltInTool(Translation);
    await this.registerBuiltInTool(ExpenseManagementToolkit);
    if (!app.isPackaged) {
      await this.registerBuiltInTool(StreamTest);
    }

    const skills = await skillManager.getSkills();
    await this.registerBuiltInTool(Skill, {
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        path: skill.path,
      })),
    });
    await this.refreshMcpServer();

    // cleanup old tools
    const oldTools = await this.toolsRepository.find({
      where: { type: ToolType.BUILD_IN },
    });
    for (const tool of oldTools) {
      let needDelete = true;
      if (tool.toolkitId) {
        const tools =
          this.builtInTools.find((x) => x.id === tool.toolkitId)?.tools ?? [];
        needDelete = !tools.find(
          (x) => x.id === tool.id.substring(ToolType.BUILD_IN.length + 1),
        );
      } else {
        needDelete = !this.builtInTools.find((x) => x.id === tool.id);
      }
      if (needDelete) await this.toolsRepository.delete(tool.id);
    }

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
        // fetch: async (url, init) => {
        //   return fetch(url, {
        //     ...init,
        //     body: init.body,
        //     headers: {
        //       ...(mcpConfig.headers ?? {}),
        //       Accept: 'application/json, text/event-stream',
        //     },
        //   });
        // },
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

  async refreshMcpServer() {
    await this.mcpServer?.close();
    this.mcpServer = new McpServer({
      name: 'aime-server',
      version: '1.0.0',
    });
    const tools = await this.getList();
    for (const tool of tools[ToolType.BUILD_IN]) {
      const builtInTool = this.builtInTools.find((x) => x.id === tool.id);

      if (builtInTool.isToolkit) {
        for (const _tool of builtInTool.tools) {
          const inputSchema = _tool.inputSchema?.shape;
          const outputSchema = _tool.outputSchema?.shape ?? undefined;

          this.mcpServer.registerTool(
            _tool.id,
            {
              description: _tool.description,
              inputSchema,
              outputSchema,
              // outputSchema: zodToJsonSchema(builtInTool.outputSchema),
            },
            async (args) => {
              const toolEntity = await this.toolsRepository.findOne({
                where: { id: builtInTool.id },
              });
              if (!toolEntity?.isActive) throw new Error('Tool is not active');
              const buildedTool = (await this.buildTool(
                `${ToolType.BUILD_IN}:${_tool.id}`,
              )) as BaseTool;
              const result = await buildedTool.execute?.(args);
              return {
                content: [
                  {
                    type: 'text',
                    text: isObject(result) ? JSON.stringify(result) : result,
                  },
                ],
                // structuredContent: result,
              };
            },
          );
        }
      } else {
        // this.server.server.
        const inputSchema = builtInTool.inputSchema.shape;
        // const outputSchema = builtInTool.outputSchema?.shape ?? undefined;
        this.mcpServer.registerTool(
          tool.name,
          {
            description: builtInTool.description,
            inputSchema,
            // outputSchema,
            // outputSchema: zodToJsonSchema(builtInTool.outputSchema),
          },
          async (args) => {
            const toolEntity = await this.toolsRepository.findOne({
              where: { id: builtInTool.id },
            });
            if (!toolEntity.isActive) throw new Error('Tool is not active');
            const buildedTool = (await this.buildTool(
              builtInTool.id,
            )) as BaseTool;
            const result = await buildedTool.execute?.(args);
            return {
              content: [
                {
                  type: 'text',
                  text:
                    isObject(result) || isArray(result)
                      ? JSON.stringify(result)
                      : result,
                },
              ],
              // structuredContent: result,
            };
          },
        );
      }
    }
  }

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
        if (mcpClient.status === 'starting') {
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
        }

        resolve(null);
      });
    });

    this.registerBuiltInTools();
  }

  @channel(ToolChannel.SaveSkill)
  public async saveSkill(id: string | undefined, data: any) {
    let localSkill: Tools;
    const { files }: { files: string[] } = data;
    if (id) {
      localSkill = await this.toolsRepository.findOne({ where: { id } });
    } else {
      id = `${ToolType.SKILL}:${nanoid()}`;
      localSkill = await this.toolsRepository.save(
        new Tools(id, data.name, ToolType.SKILL),
      );
    }
    localSkill.description = data.description;
    await this.toolsRepository.save(localSkill);
    await skillManager.saveSkill(
      localSkill.id as `${ToolType.SKILL}:${string}`,
      data.name,
      data.description,
    );
    await appManager.sendEvent(ToolEvent.ToolListUpdated, {
      id: localSkill.id,
      status: 'created',
    });
    return localSkill;
  }

  @channel(ToolChannel.ImportSkill)
  public async importSkill(data: { files: string[] }) {
    const { files }: { files: string[] } = data;
    const skills = [];
    for (const file of files) {
      const fileName = path.basename(file);
      const skill = await skillManager.parseSkill(file);
      const skillName = skill.name.toLowerCase().replaceAll(' ', '-');
      const id = `${ToolType.SKILL}:${skillName}`;
      if (await this.toolsRepository.findOne({ where: { id } })) {
        throw new Error(`Skill ${skillName} already exists`);
      }
      const tool = new Tools(
        `${ToolType.SKILL}:local:${skillName}`,
        skillName,
        ToolType.SKILL,
      );
      // tool.description = skill.description;
      const savePath = path.join(app.getPath('userData'), 'skills', skillName);
      tool.value = {
        path: savePath,
      };
      // await this.toolsRepository.save(localSkill);
      skills.push({ tool, importPath: file, savePath });
    }

    for (const { tool, importPath, savePath } of skills) {
      const skill = await skillManager.parseSkill(importPath, savePath);
      // tool.name = skill.name;
      await this.toolsRepository.save(tool);
      await appManager.sendEvent(ToolEvent.ToolListUpdated, {
        id: skill.id,
        status: 'created',
      });
    }
  }

  @channel(ToolChannel.SaveMCPServer)
  public async saveMCPServer(id: string | undefined, data: string) {
    const config = JSON.parse(data);
    if (!('mcpServers' in config)) {
      throw new Error('Invalid config');
    }
    const mcpServers = config.mcpServers as [];
    let toolEntity;
    if (Object.keys(mcpServers).length > 0) {
      const keys = Object.keys(mcpServers);
      const existingTools = await this.toolsRepository.find({
        where: { name: In(keys), id: Not(id) },
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

    const _id = id || `${ToolType.MCP}:${nanoid()}`;
    const mcp = new MCPClient({
      id: _id,
      servers: { [key]: servers as MastraMCPServerDefinition },
    });
    const oldMcpClient = this.mcpClients.find((x) => x.id == _id);
    if (oldMcpClient && oldMcpClient.status === 'running') {
      await oldMcpClient.mcp.disconnect();
    }
    this.mcpClients = this.mcpClients.filter((x) => x.id !== _id);
    const mcpClient = {
      id: _id,
      mcp,
      status: 'stopped' as McpClientStatus,
      error: undefined,
    };
    const mcpStatus = {
      id: _id,
      status: 'stopped' as McpClientStatus,
      error: undefined,
    };

    this.mcpClients.push(mcpClient);
    await this.sendMcpClientUpdatedEvent(_id, mcpStatus.status);
    try {
      const tool = new Tools(_id, key, ToolType.MCP);
      tool.mcpConfig = {
        [key]: value,
      };
      await this.toolsRepository.save(tool);
      await appManager.sendEvent(ToolEvent.ToolListUpdated, {
        id: _id,
        status: 'created',
      });
    } catch (error: any) {
      mcpStatus.status = 'error';
      mcpStatus.error = error as Error;
      await this.sendMcpClientUpdatedEvent(
        _id,
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
    if (id.startsWith(`${ToolType.MCP}:`)) {
      const tool = await this.toolsRepository.findOne({ where: { id } });
      if (!tool) {
        throw new Error('Tool not found');
      }
      const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);
      if (mcp) {
        await mcp.mcp.disconnect();
      }
      this.mcpClients = this.mcpClients.filter((x) => x.id !== id);
      await this.toolsRepository.delete(id);
    } else if (id.startsWith(`${ToolType.SKILL}:`)) {
      const tool = await this.toolsRepository.findOne({ where: { id } });
      if (!tool) {
        throw new Error('Tool not found');
      }
      await skillManager.deleteSkill(id as `${ToolType.SKILL}:${string}`);
      await this.toolsRepository.delete(id);
      if (id.startsWith(`${ToolType.SKILL}:local:`)) {
        await fs.promises.rm(tool.value?.path, { recursive: true });
      }
    }

    await appManager.sendEvent(ToolEvent.ToolListUpdated, {
      id,
      status: 'deleted',
    });
  }

  @channel(ToolChannel.GetAvailableTools)
  public async getAvailableTools(): Promise<Record<ToolType, Tool[]>> {
    const tools = await this.toolsRepository.find({
      where: { isActive: true, toolkitId: IsNull() },
    });

    const subtools = await this.toolsRepository.find({
      where: { isActive: true, toolkitId: Not(IsNull()) },
    });

    return {
      [ToolType.MCP]: tools
        .filter(
          (tool) =>
            tool.type === ToolType.MCP &&
            this.mcpClients.find((x) => x.id === tool.id)?.status === 'running',
        )
        .map((tool) => {
          const mcpClient = this.mcpClients.find((x) => x.id === tool.id);
          const mcpTools = mcpClient?.mcp?.tools ?? {};
          return {
            id: tool.id,
            name: tool.name,
            description: tool.description,
            isActive: true,
            isToolkit: true,
            type: ToolType.MCP,
            tools:
              Object.values(mcpTools).map((x) => {
                return {
                  id: `${ToolType.MCP}:${x.id}`,
                  name: x.id.substring(tool.name.length + 1),
                  description: x.description,
                };
              }) ?? [],
          };
        }),
      [ToolType.BUILD_IN]: tools
        .filter((tool) => tool.type === ToolType.BUILD_IN)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          isActive: true,
          isToolkit:
            subtools.filter((subtool) => subtool.toolkitId === tool.id).length >
            0,
          type: ToolType.BUILD_IN,
          tools: subtools
            .filter((subtool) => subtool.toolkitId === tool.id)
            .map((subtool) => ({
              id: subtool.id,
              name: subtool.name,
              description: subtool.description,
            })),
        })),
      [ToolType.SKILL]: tools
        .filter((tool) => tool.type === ToolType.SKILL)
        .map((tool) => ({
          id: tool.id,
          name: tool.name,
          description: tool.description,
          isActive: true,
          isToolkit: false,
          type: ToolType.SKILL,
        })),
    };
  }

  @channel(ToolChannel.GetList)
  public async getList(filter?: { type?: ToolType }) {
    const tools = await this.toolsRepository.find({
      where: { type: filter?.type },
    });
    const skills = await skillManager.getSkills();
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
    let tool = await this.toolsRepository.findOne({ where: { id } });
    if (id.startsWith(`${ToolType.SKILL}:`)) {
      const marketplace = id.split(':')[1];
      const skill = id.split(':').slice(2).join(':');

      const sk = await skillManager.getSkill(
        id as `${ToolType.SKILL}:${string}`,
      );

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
        try {
          if (!mcp.mcp.tools) {
            mcp.mcp.tools = await mcp.mcp.listTools();
          }
          tools = mcp.mcp.tools;

          version = mcp.mcp.mcpClientsById.get(tool.name)?.client
            ?._serverVersion?.version;
        } catch (error: any) {
          mcp.status = 'error';
          mcp.error = error as Error;
          await this.sendMcpClientUpdatedEvent(id, mcp.status, mcp.error);
          await this.toolsRepository.update(tool.id, { isActive: false });
          tool = await this.toolsRepository.findOne({ where: { id } });
        }

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
          const key = Object.keys(tool.mcpConfig)[0];
          return {
            id: t.id,
            name: t.id.substring(key.length + 1),
            description: t.description,
            inputSchema: zodToJsonSchema(t.inputSchema),
          };
        }),
      };
    } else if (tool.type === ToolType.BUILD_IN) {
      const _tool = tool.toolkitId
        ? this.builtInTools
            .find((x) => x.id === tool.toolkitId)
            ?.tools.find((x) => x.id == tool.name)
        : this.builtInTools.find((x) => x.id === tool.id);
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
      const skill = id.split(':').pop();
      let tool = await this.toolsRepository.findOne({ where: { id } });
      const skillInfo = await skillManager.getSkill(
        id as `${ToolType.SKILL}:${string}`,
      );
      if (!tool) {
        tool = new Tools(id, skillInfo.name, ToolType.SKILL);
        tool.isActive = true;
      } else {
        tool.isActive = !tool.isActive;
      }
      // tool.name = skillInfo.name;
      await this.toolsRepository.save(tool);
      await appManager.sendEvent(ToolEvent.ToolListUpdated, {
        id: id,
        status: 'updated',
      });
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
              await this.sendMcpClientUpdatedEvent(id, 'running', undefined);
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
      await appManager.sendEvent(ToolEvent.ToolListUpdated, {
        id: id,
        status: 'updated',
      });
      tool.isActive = !tool.isActive;
      await this.toolsRepository.save(tool);

      // const toolRes = await this.getTool(id);

      return tool;
    }
  }

  @channel(ToolChannel.ReconnectMCP)
  public async reconnectMCP(id: string) {
    let tool = await this.toolsRepository.findOne({ where: { id } });
    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP && tool.isActive) {
      const mcp = this.mcpClients.find((x) => x.id === `${tool.id}`);
      if (mcp && mcp.status === 'running') {
        await mcp.mcp.disconnect();
        mcp.status = 'starting';
        await this.sendMcpClientUpdatedEvent(id, 'starting', undefined);
        try {
          const tools = await mcp.mcp.listTools();
          mcp.mcp.tools = tools;
          mcp.status = 'running';
          mcp.error = undefined;
          await this.sendMcpClientUpdatedEvent(id, mcp.status, undefined);
        } catch (error: any) {
          mcp.status = 'error';
          mcp.error = error as Error;
          await this.sendMcpClientUpdatedEvent(id, mcp.status, mcp.error);
          await this.toolsRepository.update(tool.id, { isActive: false });
        }
      }
    }
  }

  @channel(ToolChannel.UpdateToolConfig)
  public async updateToolConfig(id: string, value: any) {
    const tool = await this.toolsRepository.findOne({ where: { id } });
    if (!tool) throw new Error('Tool not found');
    if (tool.type === ToolType.MCP) {
    } else if (tool.type === ToolType.BUILD_IN) {
      tool.value = value;
      await this.toolsRepository.save(tool);
    }
  }

  @channel(ToolChannel.ExecuteTool)
  public async executeTool(id: string, toolName: string, input: any) {
    let toolEntity = await this.toolsRepository.findOne({ where: { id } });
    if (!toolEntity) throw new Error('Tool not found');
    if (toolEntity.type === ToolType.MCP) {
      const mcp = this.mcpClients.find((x) => x.id === `${toolEntity.id}`);
      if (mcp) {
        const tools = await mcp.mcp.listTools();
        const mcpToolKey = Object.keys(toolEntity.mcpConfig)[0];
        const tool = tools[`${mcpToolKey}_${toolName}`];
        if (tool) {
          const res = await tool.execute?.(input);
          return res;
        } else {
          throw new Error(`Tool ${toolName} not found`);
        }
      }
    } else if (toolEntity.type === ToolType.BUILD_IN) {
      const subToolEntity = await this.toolsRepository.findOne({
        where: { toolkitId: toolEntity.id, name: toolName },
      });
      if (subToolEntity) {
        toolEntity = subToolEntity;
      }
      let buildedTool = await this.buildTool(
        toolEntity.id as `${ToolType.BUILD_IN}:${string}`,
        // toolEntity.value ?? {},
      );

      if (Array.isArray(buildedTool)) {
        buildedTool = buildedTool.find((x) => x.id === toolName);
      }

      const context = {
        tool: buildedTool as BaseTool,
        abortController: new AbortController(),
      };
      this.builtInToolContexts.push(context);
      let res;

      try {
        res = await (buildedTool as BaseTool).execute?.(input, {
          abortSignal: context.abortController.signal,
        });
      } catch (err) {
        throw err;
      } finally {
        this.builtInToolContexts = this.builtInToolContexts.filter(
          (x) => x.tool.id !== buildedTool.id,
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
  @channel(ToolChannel.PreviewGitSkill)
  public async previewGitSkill(input: { gitUrl: string }) {
    const tmpDir = path.join(os.tmpdir(), `git-clone-${crypto.randomUUID()}`);
    try {
      // Parse GitHub URL or owner/repo format
      let repoUrl: string;
      let gitPath: string = '';
      const { gitUrl } = input;

      if (gitUrl.includes('github.com')) {
        // Parse full GitHub URL
        const parsed = this.parseGitHubUrl(gitUrl);
        repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
        gitPath = parsed.path;
      } else {
        // Assume it's owner/repo[/path] or owner/repo/tree|blob/branch/path
        const parts = gitUrl.split('/').filter(Boolean);
        if (parts.length < 2) {
          return {
            success: false,
            error:
              'Invalid path format. Use owner/repo/path or full GitHub URL',
          };
        }
        repoUrl = `https://github.com/${parts[0]}/${parts[1]}.git`;
        if (parts.length <= 2) {
          gitPath = '';
        } else if (parts[2] === 'tree' || parts[2] === 'blob') {
          if (parts.length < 5) {
            return {
              success: false,
              error:
                'Invalid path format. Use owner/repo/tree/branch/path or full GitHub URL',
            };
          }
          gitPath = parts.slice(4).join('/');
        } else {
          gitPath = parts.slice(2).join('/');
        }
      }

      // Shallow clone for speed
      await runCommand(`git clone --depth 1 ${repoUrl} "${tmpDir}"`);

      // Find skills in the cloned repo
      let skillsToScan: string[] = [];

      if (gitPath) {
        // Specific path provided
        const targetPath = path.join(tmpDir, gitPath);
        if (
          await fs.promises
            .access(targetPath)
            .then(() => true)
            .catch(() => false)
        ) {
          const skillDir = await this.findSkillDirectory(targetPath);
          if (skillDir) {
            skillsToScan.push(skillDir);
          }
        }
      }
      // If no specific path or no skill found at path, scan entire repo
      if (skillsToScan.length === 0) {
        skillsToScan = await this.getSkillsInDir(tmpDir);
      }

      // Extract skill info
      const skills = await Promise.all(
        skillsToScan.map(async (skillPath) => {
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          const skillMd = await fs.promises
            .readFile(skillMdPath, 'utf-8')
            .catch(() => '');
          const relativePath = path.relative(tmpDir, skillPath);
          const data = matter(skillMd);
          return {
            id: path.basename(path.dirname(skillMdPath)),
            name: data.data.name,
            path: relativePath,
            description: data.data.description,
          };
        }),
      );

      return {
        success: true,
        skills,
        repoUrl,
        gitPath,
        tmpDir,
      };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await fs.promises
        .rm(tmpDir, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  private parseGitHubUrl(url: string): {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    type: 'dir' | 'file';
  } {
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/,
      /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const [, owner, repo, branch, path] = match;
        return {
          owner,
          repo,
          branch,
          path,
          type: pattern.toString().includes('blob') ? 'file' : 'dir',
        };
      }
    }

    const simpleMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (simpleMatch) {
      return {
        owner: simpleMatch[1],
        repo: simpleMatch[2].replace('.git', ''),
        branch: 'main',
        path: '',
        type: 'dir',
      };
    }

    throw new Error('Invalid GitHub URL format');
  }

  private async getSkillsInDir(dirPath: string): Promise<string[]> {
    const skills: string[] = [];

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      // Skip hidden directories like .git
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const skillPath = path.join(dirPath, entry.name);
        const skillMPath = path.join(skillPath, 'SKILL.md');
        const exists = await fs.promises
          .access(skillMPath)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          skills.push(skillPath);
        } else {
          const subSkills = await this.getSkillsInDir(skillPath);
          skills.push(...subSkills);
        }
      }
    }

    return skills;
  }

  private async findSkillDirectory(dirPath: string): Promise<string | null> {
    const skillMPath = path.join(dirPath, 'SKILL.md');
    const exists = await fs.promises
      .access(skillMPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return dirPath;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const subDirPath = path.join(dirPath, entry.name);
        const found = await this.findSkillDirectory(subDirPath);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  @channel(ToolChannel.ImportSkills)
  public async importSkills(data: {
    repo_or_url: string;
    files: string[];
    path?: string;
    selectedSkills: string[];
  }) {
    let skillsPath;
    if (data.path) {
      skillsPath = path.join(data.path, '.aime-chat', 'skills');
    } else {
      skillsPath = path.join(app.getPath('userData'), 'skills');
    }
    await fs.promises.mkdir(skillsPath, {
      recursive: true,
    });
    const tmpDir = path.join(os.tmpdir(), `git-clone-${crypto.randomUUID()}`);
    let repoUrl: string;
    let gitPath: string = '';
    const { repo_or_url } = data;

    if (repo_or_url.includes('github.com')) {
      // Parse full GitHub URL
      const parsed = this.parseGitHubUrl(repo_or_url);
      repoUrl = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
      gitPath = parsed.path;
    } else {
      // Assume it's owner/repo[/path] or owner/repo/tree|blob/branch/path
      const parts = repo_or_url.split('/').filter(Boolean);
      if (parts.length < 2) {
        return {
          success: false,
          error: 'Invalid path format. Use owner/repo/path or full GitHub URL',
        };
      }
      repoUrl = `https://github.com/${parts[0]}/${parts[1]}.git`;
      if (parts.length <= 2) {
        gitPath = '';
      } else if (parts[2] === 'tree' || parts[2] === 'blob') {
        if (parts.length < 5) {
          return {
            success: false,
            error:
              'Invalid path format. Use owner/repo/tree/branch/path or full GitHub URL',
          };
        }
        gitPath = parts.slice(4).join('/');
      } else {
        gitPath = parts.slice(2).join('/');
      }
    }

    // Shallow clone for speed
    const result = await runCommand(
      `git clone --depth 1 ${repoUrl} "${tmpDir}"`,
    );
    if (result.code !== 0) {
      return {
        success: false,
        error: result.stderr,
      };
    }
    // Find skills in the cloned repo
    let skillsToScan: string[] = [];

    if (gitPath) {
      // Specific path provided
      const targetPath = path.join(tmpDir, gitPath);
      if (
        await fs.promises
          .access(targetPath)
          .then(() => true)
          .catch(() => false)
      ) {
        const skillDir = await this.findSkillDirectory(targetPath);
        if (skillDir) {
          skillsToScan.push(skillDir);
        }
      }
    }

    // If no specific path or no skill found at path, scan entire repo
    if (skillsToScan.length === 0) {
      skillsToScan = await this.getSkillsInDir(tmpDir);
    }

    // Extract skill info
    const skills = await Promise.all(
      skillsToScan.map(async (skillPath) => {
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        const skillMd = await fs.promises
          .readFile(skillMdPath, 'utf-8')
          .catch(() => '');
        const relativePath = path.relative(tmpDir, skillPath);
        const data = matter(skillMd);
        return {
          id: path.basename(path.dirname(skillMdPath)),
          name: data.data.name,
          path: relativePath,
          description: data.data.description,
        };
      }),
    );
    const selectedSkills = skills.filter((x) =>
      data.selectedSkills.includes(x.path),
    );

    for (const selectedSkill of selectedSkills) {
      await fs.promises.cp(
        path.join(tmpDir, selectedSkill.path),
        path.join(skillsPath, selectedSkill.id),
        {
          recursive: true,
        },
      );
    }

    await fs.promises.rmdir(tmpDir, { recursive: true });
    return {
      success: true,
    };
    console.log(data);
  }

  async buildTool(
    toolId?: string,
    config?: any,
  ): Promise<BaseTool | BaseTool[]> {
    const tools = await this.buildTools([toolId], { [toolId]: config });

    return (
      tools[toolId.substring(ToolType.BUILD_IN.length + 1)] ??
      Object.values(tools)
    );
  }

  /**
   * Build tools
   * @param toolIds - Tool ids (eg: ['${ToolType.BUILD_IN}:Skill', '${ToolType.BUILD_IN}:Read])
   * @param config - Tool config
   * @returns Tools
   */
  async buildTools(
    toolIds?: string[],
    config?: Record<string, any>,
  ): Promise<Record<string, BaseTool>> {
    if (!toolIds) return {};
    const tools = {};
    const toolEntities = await this.toolsRepository.find({
      where: { type: ToolType.BUILD_IN, id: In(toolIds) },
    });
    for (const toolName of toolIds) {
      if (toolName.startsWith(`${ToolType.BUILD_IN}:`)) {
        let tool = this.builtInTools.find((x) => x.id === toolName);
        if (!tool) {
          tool = this.builtInTools.find(
            (x) =>
              x.isToolkit &&
              x.tools.find(
                (x) => x.id == toolName.substring(ToolType.BUILD_IN.length + 1),
              ),
          );
        }

        if (!tool) continue;

        let params = config?.[tool.id];
        if (params === undefined) {
          params = toolEntities.find((x) => x.id === toolName)?.value;
        }
        if (!tool.isToolkit) {
          const newTool = new tool.classType(params) as BaseTool;
          const t = createTool({
            ...newTool,
            id: tool.id.substring(ToolType.BUILD_IN.length + 1),
          });

          tools[t.id] = t;
        } else {
          const toolEntity = toolEntities.find((x) => x.id === toolName);
          const newToolkit = new tool.classType({
            [toolEntity.name]: toolEntity.value,
          }) as BaseToolkit;
          for (const _tool of newToolkit.tools) {
            if (_tool.id == toolName.substring(ToolType.BUILD_IN.length + 1)) {
              const t = createTool({
                ..._tool,
                id: _tool.id,
              });
              tools[t.id] = t;
            }
          }
        }
      } else if (toolName.startsWith(`${ToolType.MCP}:`)) {
        const mcpClients = this.mcpClients.filter((x) => x.status == 'running');
        for (const mcpClient of mcpClients) {
          const mcpTools = await mcpClient.mcp.listTools();
          const keys = Object.keys(mcpTools).filter(
            (x) => `${ToolType.MCP}:${x}` == toolName,
          );
          for (const key of keys) {
            const t = mcpTools[key];
            tools[t.id] = t;
          }
        }
      }
    }
    return tools;
  }
}

export const toolsManager = new ToolsManager();
