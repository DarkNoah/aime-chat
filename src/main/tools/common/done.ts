import type {
  ToolExecutionContext,
  ValidationError,
} from '@mastra/core/tools' with { "resolution-mode": "import" };
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';



export class Done extends BaseTool {
  static readonly toolName = 'Done';
  id: string = 'Done';
  description = 'When you sure the job is done, use this tool to finish the job.';
  inputSchema = z.object({});

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ): Promise<unknown | ValidationError> => {
    const { requestContext } = options;
    const untilEndPrompt = requestContext?.get('untilEndPrompt' as never);
    if (untilEndPrompt) {
      requestContext?.set('untilEndPrompt' as never, { enable: false, prompt: untilEndPrompt?.prompt as string } as never);
    }
    return 'done';
  };
}
