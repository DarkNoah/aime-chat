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
import { appManager } from '@/main/app';
import { ChatEvent } from '@/types/chat';
import { isString } from '@/utils/is';

export class SendEvent extends BaseTool {
  static readonly toolName = 'SendEvent';
  id: string = 'SendEvent';
  description = `Send an event to the user interface panel.

Usage notes:
 - send a web preview url event to the web preview panel, example: {"url": "http://localhost:3000"}
  `;
  inputSchema = z.object({
    target_panel: z.enum(['canvas', 'web_preview']),
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
    const { target_panel, data } = inputData;
    const { writer } = options;
    const value = JSON.parse(data);

    const threadId = options?.requestContext.get('threadId' as never) as string;

    if (target_panel === 'canvas') {
    } else if (target_panel === 'web_preview') {
      if (!value?.url || !isString(value?.url)) {
        throw new Error('"url" is required');
      }
    }

    await writer.write({
      type: 'data-send-event',
      data: {
        target_panel,
        data: value,
      },
    });
    return 'done';
  };
}
