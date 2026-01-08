import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '@/main/app';
import { ChatEvent } from '@/types/chat';
import { isString } from '@/utils/is';
import { toolsManager } from '..';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { ToolConfig, ToolType } from '@/types/tool';
import { localModelManager } from '@/main/local-model';
import { LocalRerankModel } from '@/main/providers/local-provider';

export interface ToolToolkitParams extends BaseToolParams {
  modelId?: string;
  numResults?: number;
}

export class ToolSearch extends BaseTool<ToolToolkitParams> {
  static readonly toolName = 'ToolSearch';
  id: string = 'ToolSearch';
  description = `Search for available tools that can help with a task. Returns tool definitions for matching tools. Use this when you need a tool but don't have it available yet.`;
  inputSchema = z.object({
    query: z
      .string()
      .describe(
        `Natural language description of what kind of tool you need (e.g., 'weather information', 'currency conversion', 'stock prices')`,
      ),
    top_k: z
      .number()
      .optional()
      .default(5)
      .describe('Number of tools to return (default: 5)'),
  });

  outputSchema = z.string();

  constructor(config?: ToolToolkitParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { query, top_k } = inputData;
    const { writer } = options;

    const tools = await toolsManager.getList();
    const model = new LocalRerankModel('bge-reranker-base');
    const results = await model.doRerank({
      query,
      documents: tools[ToolType.BUILD_IN].map(
        (tool) => `${tool.name}: ${tool.description}`,
      ),
      options: {
        top_k: top_k,
        return_documents: true,
      },
    });

    // const matchingTools = tools.filter((tool) => tool.description.includes(query));
    // const topKTools = matchingTools.slice(0, top_k);
    // return topKTools.map((tool) => tool.id).join(', ');
    return `<tools>
    ${results.map((result) => `<tool>${result.document}</tool>`).join('\n')}
</tools>`;
  };
}

export class ToolExecution extends BaseTool<ToolToolkitParams> {
  static readonly toolName = 'ToolExecution';
  id: string = 'ToolExecution';
  description = `tool execution`;
  inputSchema = z.object({
    tool_name: z.string().describe(`Name of the tool being executed`),
    tool_input: z
      .string()
      .optional()
      .describe(`Input parameters for the tool, must be a json string`),
  });

  outputSchema = z.string();

  constructor(config?: ToolToolkitParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { tool_name, tool_input } = inputData;
    const { writer } = options;

    const tools = await toolsManager.getAvailableTools();
    const tool = (await toolsManager.buildTool(
      `${ToolType.BUILD_IN}:${tool_name}` as `${ToolType.BUILD_IN}:${string}`,
    )) as BaseTool;
    const result = await tool.execute?.(JSON.parse(tool_input), options);
    return result;
  };
}

class ToolToolkit extends BaseToolkit {
  static readonly toolName = 'ToolToolkit';
  id = 'ToolToolkit';

  configSchema = ToolConfig.ToolToolkit.configSchema;

  constructor(params?: ToolToolkitParams) {
    super([new ToolSearch(params), new ToolExecution(params)], params);
  }

  getTools() {
    return this.tools;
  }
}
export default ToolToolkit;
