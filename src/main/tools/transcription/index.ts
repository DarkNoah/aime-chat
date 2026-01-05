import { experimental_transcribe as transcribe } from 'ai';
import BaseTool from '../base-tool';
import { BaseToolParams } from '../base-tool';
import { z, ZodType, ZodTypeDef } from 'zod';

export class Transcription extends BaseTool {
  static readonly toolName = 'Transcription';
  id: string = 'Transcription';
  inputSchema = z.object({
    file_path_or_url: z.string().describe('The path to the file to transcribe'),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }
}
