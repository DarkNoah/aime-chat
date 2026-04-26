import type {
  ToolExecutionContext,
  ValidationError,
} from '@mastra/core/tools' with { "resolution-mode": "import" };
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';



export class Done extends BaseTool {
  static readonly toolName = 'Done';
  id: string = 'Done';
  description = [
    'Signal that the entire task is fully completed and the conversation can end.',
    '',
    'This tool is the ONLY way to exit the end-of-turn guard loop. Call it when, and only when, ALL of the following are true:',
    '1. Every requirement in the user request has been satisfied.',
    '2. Every item required by the end-guard checklist (provided in the latest End-Guard system-reminder) has been verified to pass.',
    '3. There is no remaining follow-up action you intend to take.',
    '',
    'Do NOT call this tool if any check still needs to be performed, any error remains unresolved, or you plan to continue working. In those cases, keep working and call other tools instead.',
  ].join('\n');
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
