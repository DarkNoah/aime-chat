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
export interface SkillToolParams extends BaseToolParams {
  skills:{
    title: string;
    description: string;
  }[]
}


export class Skill extends BaseTool {
  id: string = 'Skill';
  description = '测试工具';
  inputSchema = z.object({
    skill: z
      .string()
      .describe(`The skill name (no arguments). E.g., "pdf" or "xlsx"`),
  });

  constructor(config?: SkillToolParams) {
    super(config);
    this.description = config?.description ?? this.description;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { skill } = inputData;

    return skill;
  };
}
