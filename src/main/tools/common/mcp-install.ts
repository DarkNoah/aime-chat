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

export class MCPInstall extends BaseTool {
  static readonly toolName = 'MCPInstall';
  id: string = 'MCPInstall';
  description = `
  `;
  inputSchema = z.object({
    mode: z.enum(['stdio', 'sse']),
    name: z.string().describe('the name of the mcp server'),
    description: z.string().describe('the description of the mcp server'),
    mcpServer: z.string().describe('must be a JSON string'),
  });

  requireApproval = true;
  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { mode, name, description, mcpServer } = inputData;

    return 'done';
  };
}
