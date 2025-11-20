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
    time: z.number().describe('结束时间(毫秒)'),
  });

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
  ) => {
    const abortSignal = options?.abortSignal as AbortSignal;
    const { time } = inputData;

    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, time);
      abortSignal?.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
    throw new Error('error');

    if (abortSignal?.aborted) {
      return 'aborted';
    }

    return 'ok';
  };
}
