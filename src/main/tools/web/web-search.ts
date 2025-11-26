import { Agent } from '@mastra/core/agent';
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

export class WebSearch extends BaseTool {
  id: string = 'WebSearch';
  description = `- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US
  - Account for "Today's date" in <env>. For example, if <env> says "Today's date: 2025-07-01", and the user wants the latest docs, do not use 2024 in the search query. Use 2025.
`;
  inputSchema = z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
  });

  configSchema = z.strictObject({
    providerId: z.string().describe('The search query to use'),
  });

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
  ) => {
    const { query } = inputData;
    return '';
  };
}
