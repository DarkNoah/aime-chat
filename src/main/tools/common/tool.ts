import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '@/main/app';
import { ChatEvent } from '@/types/chat';
import { isString } from '@/utils/is';
import { toolsManager } from '..';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { ToolType } from '@/types/tool';
import { localModelManager } from '@/main/local-model';
import { LocalRerankModel } from '@/main/providers/local-provider';

export class ToolSearch extends BaseTool {
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

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
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
    <tool>

    </tool>
</tools>`;
  };
}

export class ToolExecution extends BaseTool {
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

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
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
  id = 'ToolToolkit';
  constructor(params?: BaseToolkitParams) {
    super([new ToolSearch(), new ToolExecution()], params);
  }

  getTools() {
    return this.tools;
  }
}
export default ToolToolkit;
