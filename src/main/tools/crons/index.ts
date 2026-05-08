import { cronsManager } from '@/main/app/crons';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { ToolExecutionContext } from '@mastra/core/tools';
import { z, ZodSchema } from 'zod';
import { agentManager } from '@/main/mastra/agents';
import { appManager } from '@/main/app';

export class CronsList extends BaseTool {
  static readonly toolName = 'CronsList';
  id: string = 'CronsList';
  description = 'List all scheduled cron jobs.';

  inputSchema = z.object({});

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    _inputData: z.infer<typeof this.inputSchema>,
    _options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const list = await cronsManager.getList();
    return list.map((x) => ({
      id: x.id,
      name: x.name,
      cron: x.cron,
      prompt: x.prompt,
      isActive: x.isActive,
      reuseThread: x.reuseThread,
      description: x.description,
      agentId: x.submitOptions?.agentId,
      lastRunAt: x.lastRunAt,
    }));
  };
}

export class CronsCreate extends BaseTool {
  static readonly toolName = 'CronsCreate';
  id: string = 'CronsCreate';
  description = 'Create a new scheduled cron job.';

  inputSchema = z.object({
    name: z.string().describe('Unique name for the cron job.'),
    prompt: z.string().describe('The prompt to execute when triggered.'),
    cron: z
      .string()
      .describe('Cron expression (e.g. "*/5 * * * *" for every 5 minutes).'),
    description: z
      .string()
      .describe('Optional description of the cron job.')
      .optional(),
    agentId: z
      .string()
      .describe('Optional agent ID to associate with this cron job.')
      .optional(),
    isActive: z
      .boolean()
      .describe('Whether the cron job should be active immediately.')
      .optional()
      .default(true),
    reuseThread: z
      .boolean()
      .describe('Reuse the last chat thread for future runs when it still exists.')
      .optional()
      .default(false),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const appInfo = await appManager.getInfo();

    const agent = await agentManager.getAgent(inputData.agentId ?? appInfo.defaultAgent);
    const { defaultModelId = appInfo.defaultModel?.model, tools = [], subAgents = [] } = agent;
    const result = await cronsManager.create({
      name: inputData.name,
      prompt: inputData.prompt,
      cron: inputData.cron,
      description: inputData.description,
      submitOptions: {
        agentId: agent.id,
        model: defaultModelId,
        tools: tools,
        subAgents: subAgents,
      },
      isActive: inputData.isActive ?? true,
      reuseThread: inputData.reuseThread ?? false,
    });
    return {
      id: result.id,
      name: result.name,
      cron: result.cron,
      isActive: result.isActive,
      reuseThread: result.reuseThread,
    };
  };
}

export class CronsUpdate extends BaseTool {
  static readonly toolName = 'CronsUpdate';
  id: string = 'CronsUpdate';
  description = 'Update an existing scheduled cron job.';

  inputSchema = z.object({
    id: z.string().describe('The ID of the cron job to update.'),
    name: z.string().describe('New name for the cron job.').optional(),
    prompt: z.string().describe('New prompt to execute.').optional(),
    cron: z.string().describe('New cron expression.').optional(),
    description: z.string().describe('New description.').optional(),
    agentId: z.string().describe('New agent ID.').optional(),
    isActive: z
      .boolean()
      .describe('Enable or disable the cron job.')
      .optional(),
    reuseThread: z
      .boolean()
      .describe('Reuse the last chat thread for future runs when it still exists.')
      .optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { id, agentId, ...data } = inputData;
    const result = await cronsManager.update(id, {
      ...data,
      ...(agentId !== undefined
        ? {
            submitOptions: {
              agentId,
            },
          }
        : {}),
    });
    return {
      id: result.id,
      name: result.name,
      cron: result.cron,
      isActive: result.isActive,
      reuseThread: result.reuseThread,
    };
  };
}

export class CronsDelete extends BaseTool {
  static readonly toolName = 'CronsDelete';
  id: string = 'CronsDelete';
  description = 'Delete a scheduled cron job.';

  inputSchema = z.object({
    id: z.string().describe('The ID of the cron job to delete.'),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    await cronsManager.delete(inputData.id);
    return { success: true };
  };
}

export class CronsToolkit extends BaseToolkit {
  static readonly toolName = 'CronsToolkit';
  id: string = 'CronsToolkit';
  description = 'Toolkit for managing scheduled cron jobs (list, create, update, delete).';

  constructor(params?: BaseToolkitParams) {
    const listConfig = params?.[CronsList.toolName];
    const createConfig = params?.[CronsCreate.toolName];
    const updateConfig = params?.[CronsUpdate.toolName];
    const deleteConfig = params?.[CronsDelete.toolName];
    super(
      [
        new CronsList(listConfig),
        new CronsCreate(createConfig),
        new CronsUpdate(updateConfig),
        new CronsDelete(deleteConfig),
      ],
      params,
    );
  }
}
