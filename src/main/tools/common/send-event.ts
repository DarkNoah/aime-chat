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
import { isArray, isString } from '@/utils/is';

export class SendEvent extends BaseTool {
  static readonly toolName = 'SendEvent';
  id: string = 'SendEvent';
  description = `Send an event to the user interface, used to display files, folders, or web preview in the chat message.

Usage notes:
 - Use "web_preview" event to send a web preview url event to the web preview panel, example: {"url": "http://localhost:3000"}
 - Use "files_preview" event to send multiple file or folder paths to display in chat message, example: {"files": ["/path/to/file1", "/path/to/file2"]}
 - Use this tool when you want to display generated files, created files, or any file results to the user in the chat message.
  `;
  inputSchema = z.object({
    event: z.enum(['canvas', 'web_preview', 'files_preview']),
    data: z.string().describe('must be a JSON string'),
  });

  outputSchema = z.string();

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { event, data } = inputData;
    const { writer } = options;
    const value = JSON.parse(data);

    const threadId = options?.requestContext.get('threadId' as never) as string;

    if (event === 'canvas') {
      return 'done';
    } else if (event === 'web_preview') {
      if (!value?.url || !isString(value?.url)) {
        throw new Error('"url" is required');
      }
      return 'done';
    } else if (event === 'files_preview') {
      if (!value?.files || !isArray(value?.files)) {
        throw new Error('"files" is required');
      }
      const validFiles: string[] = [];
      for (const file of value?.files) {
        const info = await appManager.getFileInfo(file);
        if (info && info.isExist) {
          if (info.isFile) {
            validFiles.push(`<file>${file}</file>`);
          } else {
            validFiles.push(`<folder>${file}</folder>`);
          }
        }
      }
      if (validFiles.length === 0) {
        return 'No valid files found.';
      }
      return validFiles.join('\n');
    }
    return 'done';
  };
}
