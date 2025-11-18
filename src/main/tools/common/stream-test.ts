import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';


export class StreamTest extends BaseTool {
  id: string = 'StreamTest';
  description = '测试工具';
  inputSchema = z.object({
    code: z.string().describe('The Python code to execute'),
  });

  constructor() {
    super();
  }

  execute = async (
    context: ToolExecutionContext<z.ZodSchema, any, any>,
    options?: MastraToolInvocationOptions,
  ) => {
    // options.w
    await new Promise((resolve)=>setTimeout(resolve,5000))

    return context.context.code;
  };
}
