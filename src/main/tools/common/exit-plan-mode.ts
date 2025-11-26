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
export interface ExitPlanModeParams extends BaseToolParams {}

export class ExitPlanMode extends BaseTool {
  id: string = 'ExitPlanMode';
  description = `Use this tool when you are in plan mode and have finished presenting your plan and are ready to code. This will prompt the user to exit plan mode.
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

Eg.

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.`;
  inputSchema = z
    .object({
      plan: z
        .string()
        .describe(
          'The plan you came up with, that you want to run by the user for approval. Supports markdown. The plan should be pretty concise.',
        ),
    })
    .strict();

  constructor(config?: ExitPlanModeParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<
      typeof this.suspendSchema,
      typeof this.resumeSchema
    >,
  ) => {
    const { plan } = inputData;
    return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable`;
  };
}
