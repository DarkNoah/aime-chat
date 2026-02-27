import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path, { constructor } from 'path';
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
  description = `Search for available tools that can help accomplish a specific task.
- Uses semantic matching to find the most relevant tools from all registered built-in tools
- Returns ranked tool definitions with names and descriptions, filtered by relevance score
- Only returns tools that are NOT already installed in the current session
- After finding a suitable tool, use ToolInstall to add it to your current session, then use ToolExecution to run it

## When to Use This Tool
- BEFORE attempting a task when you don't have the right tool available
- When a task is difficult to solve or you are unsure how to proceed — proactively search for tools that might help
- When you encounter a capability gap (e.g., need to run code, fetch a webpage, process an image, but lack the corresponding tool)
- When the user requests something that your current tool set cannot handle

Workflow: ToolSearch → ToolInstall → ToolExecution`;
  inputSchema = z.object({
    query: z
      .string()
      .describe(
        `Natural language description of the capability you need (e.g., 'fetch webpage content', 'execute python code', 'search the web for information', 'analyze an image')`,
      ),
    top_k: z
      .number()
      .optional()
      .default(5)
      .describe('Maximum number of matching tools to return (default: 5). Results are ranked by relevance.'),
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
    const { writer, requestContext } = options;
    const current_tools = requestContext.get('tools' as never) as string[] || [];

    const tools = await toolsManager.getAvailableTools();
    const buildInTools = [];
    for (const tool of tools[ToolType.BUILD_IN]) {
      // const _tool = await toolsManager.getTool(`${ToolType.BUILD_IN}:${tool.name}`);
      // if (_tool) {
      //   buildInTools.push(`${tool.name}: ${tool.description}`);
      // }

      if (!tool.isToolkit) {
        const _tool = await toolsManager.getTool(tool.id);
        if (!current_tools.includes(tool.id)) {
          buildInTools.push({ name: _tool.name, description: _tool.description, type: ToolType.BUILD_IN });
        }
      } else {
        for (const subtool of tool.tools) {
          const _tool = await toolsManager.getTool(subtool.id);
          if (!current_tools.includes(subtool.id)) {
            const _sub_tool = _tool.tools.find(x => x.id == subtool.name)
            buildInTools.push({ name: _sub_tool.id, description: _sub_tool.description, type: ToolType.BUILD_IN });
          }
        }
      }
    }
    // const skills = await toolsManager.searchSkills(query, top_k);
    // if (skills.success) {
    //   buildInTools.push(...skills.skills.map(x => ({ name: x.name, description: x.description, type: ToolType.SKILL })));
    // }


    const model = new LocalRerankModel('bge-reranker-base');
    let results = await model.doRerank({
      query,
      documents: buildInTools.map(x => `${x.name}: ${x.description}`),
      options: {
        top_k: top_k,
        return_documents: true,
      },
    });
    results = results.filter(x => x.score > 0.5);
    if (results.length == 0) {
      return `No tools match`;
    }
    return `<tools>
${results.map((result) => ` <tool type="${buildInTools[result.index].type}" name="${buildInTools[result.index].name}">\n${buildInTools[result.index].description}\n </tool>`).join('\n')}
</tools>`;
  };
}

export class ToolExecution extends BaseTool<ToolToolkitParams> {
  static readonly toolName = 'ToolExecution';
  id: string = 'ToolExecution';
  description = `Execute a built-in tool by name with the specified input parameters.
- The tool must already be installed in the current session via ToolInstall
- Input parameters must be provided as a valid JSON string matching the tool's expected input schema
- Returns the tool's execution result directly

Usage: First use ToolSearch to find the tool, then ToolInstall to install it, then use this tool to execute it.`;
  inputSchema = z.object({
    tool_name: z.string().describe(`The exact name of the built-in tool to execute (as returned by ToolSearch)`),
    tool_input: z
      .string()
      .optional()
      .describe(`Input parameters for the tool as a JSON string. Must conform to the tool's input schema. Example: '{"query": "hello world"}'`),
  });

  // outputSchema = z.string();

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

export class ToolInstall extends BaseTool<ToolToolkitParams> {
  static readonly toolName = 'ToolInstall';
  id: string = 'ToolInstall';
  description = `Install a tool into the current session so it becomes available for execution.
- Adds the specified tool to the active tool set for the current conversation
- The tool must exist in the system's registered tools; use ToolSearch first to discover available tools
- If the tool is already installed, returns a notice without duplicating it
- Supported tool types: "build-in" (built-in tools), "mcp" (MCP protocol tools), "skill" (skill-based tools)

Workflow: ToolSearch (find) → ToolInstall (this tool) → ToolExecution (run)`;
  inputSchema = z.object({
    tool_name: z.string().describe(`The exact name of the tool to install (as returned by ToolSearch results)`),
    type: z.enum([ToolType.MCP, ToolType.BUILD_IN, ToolType.SKILL]).describe(`Type of the tool: "build-in" for built-in tools, "mcp" for MCP protocol tools, "skill" for skill-based tools`),
  });

  constructor(config?: ToolToolkitParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { tool_name, type } = inputData;
    const { writer, requestContext } = options;
    const workspace = requestContext.get('workspace' as never);
    if (type === 'skill') { }
    else if (type === 'build-in') {
      let tools = requestContext.get('tools' as never) as string[];

      const toolId = `${ToolType.BUILD_IN}:${tool_name}`
      const _tool = await toolsManager.getTool(toolId);
      if (!_tool) {
        return `Tool ${tool_name} not found`;
      }
      if (tools.includes(toolId)) {
        return `Tool ${tool_name} already installed`;
      }
      tools = [...tools, `${ToolType.BUILD_IN}:${tool_name}`];
      requestContext.set('tools' as never, tools as never);
      return `Tool ${tool_name} installed`;
    }

    return 'done';
  };
}



class ToolToolkit extends BaseToolkit {
  static readonly toolName = 'ToolToolkit';
  id = 'ToolToolkit';

  configSchema = ToolConfig.ToolToolkit.configSchema;

  constructor(params?: ToolToolkitParams) {
    super([new ToolSearch(params), new ToolExecution(params), new ToolInstall(params)], params);
  }

  getTools() {
    return this.tools;
  }
}
export default ToolToolkit;
