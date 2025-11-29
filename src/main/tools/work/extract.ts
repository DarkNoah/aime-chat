import { Agent } from '@mastra/core/agent';
import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { generateText, tool } from 'ai-v5';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';

export interface ExtractParams extends BaseToolParams {
  providerId?: string;
}

export class Extract extends BaseTool<ExtractParams> {
  id: string = 'Extract';
  description = `
`;
  inputSchema = z.strictObject({
    fields: z.string().describe('The search query to use'),
    file_path: z.string().describe('The search query to use'),
  });

  configSchema = ToolConfig.Extract.configSchema;

  constructor(config?: ExtractParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
  ) => {
    const { query } = inputData;
    const config = this.config;

    return '';
  };
}
