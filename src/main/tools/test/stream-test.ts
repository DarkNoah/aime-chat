import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';

export class StreamTest extends BaseTool {
  static readonly toolName = 'StreamTest';
  id: string = 'StreamTest';
  description = '测试工具';
  inputSchema = z.object({
    time: z.number().describe('结束时间(毫秒)').default(5000),
  });

  constructor(config?: BaseToolParams) {
    super(config);
    if (config?.description) this.description = config?.description;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
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
    // throw new Error('error');

    if (abortSignal?.aborted) {
      return 'aborted';
    }

    return 'ok';
  };
}
