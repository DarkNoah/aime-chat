import type {
  ToolExecutionContext,
  ValidationError,
} from '@mastra/core/tools' with { "resolution-mode": "import" };
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { error } from 'console';

export const streamTestInputSchema = z.object({
  time: z.number().describe('结束时间(毫秒)').default(5000),
  failed: z.boolean().describe('是否失败').default(false),
});

export class StreamTest extends BaseTool {
  static readonly toolName = 'StreamTest';
  id: string = 'StreamTest';
  description = '测试工具';
  inputSchema = streamTestInputSchema;

  constructor(config?: BaseToolParams) {
    super(config);
    if (config?.description) this.description = config?.description;
  }

  execute = async (
    inputData: z.infer<typeof streamTestInputSchema>,
    options?: ToolExecutionContext,
  ): Promise<unknown | ValidationError> => {
    const now = Date.now();
    const abortSignal = options?.abortSignal as AbortSignal;
    const { time, failed } = inputData;

    if (failed) {
      // return {
      //   error: true,
      //   message: '测试失败',
      // } as ValidationError
      throw new Error('测试失败');
    }
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, time);
      abortSignal?.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
    // throw new Error('error');

    if (abortSignal?.aborted) {
      return { status: 'aborted' };
    }

    return {
      startTime: now.toString(),
      endTime: Date.now().toString(),
      status: 'ok',
    };
  };
}
