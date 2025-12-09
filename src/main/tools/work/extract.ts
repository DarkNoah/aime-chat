import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext } from '@mastra/core/tools';
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
import { jsonSchemaToZod } from "json-schema-to-zod";

export interface ExtractParams extends BaseToolParams {
  modelId?: string;
  maxChunkSize?: number;
}

export class Extract extends BaseTool<ExtractParams> {
  id: string = 'Extract';
  description = `
`;
  inputSchema = z.strictObject({
    fields: z.string().describe('Extract JsonSchema'),
    file_path: z.string().describe('The absolute path to the file to extract'),
  });

  configSchema = ToolConfig.Extract.configSchema;

  constructor(config?: ExtractParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {

    const { fields, file_path } = inputData;
    const zodSchema = jsonSchemaToZod(JSON.parse(fields))
    const model = await providersManager.getLanguageModel(this.config.modelId);
    const config = this.config;


    const extractAgent = new Agent({
      id: "extract-agent",
      name: "ExtractAgent",
      instructions: "You are a helpful assistant that extracts data from a file.",
      model: model,
    });
    const response = await extractAgent.generate(
      [
        {
          role: "system",
          content: "Provide a summary and keywords for the following text:",
        },
        {
          role: "user",
          content: "Monkey, Ice Cream, Boat",
        },
      ],
      {
        structuredOutput: {
          schema: zodSchema,
          jsonPromptInjection: true,
        },
      },
    );

    return '';
  };
}
