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

export class Skill extends BaseTool {
  id: string = 'Skill';
  description = '测试工具';
  inputSchema = z.object({
    skill: z
      .string()
      .describe(`The skill name (no arguments). E.g., "pdf" or "xlsx"`),
  });

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { skill } = inputData;

    return skill;
  };
}
