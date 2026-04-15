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
import { toolsManager } from '..';
import { SpeechToText, TextToSpeech } from '../audio';
import { ToolType } from '@/types/tool';
import { splitContextAndFiles } from '@/utils/context-utils';
import player from 'play-sound';
import { FileInfo } from '@/types/common';

export class Message extends BaseTool {
  static readonly toolName = 'Message';
  id: string = 'Message';
  description = `Send a message event to the user, used to display files, folders, or web preview, get use select result in the chat message.

Usage notes:
 - Use "web_preview" event to send a web preview url event to the web preview panel, example: {"url": "http://localhost:3000"}
 - Use "files_preview" event to send multiple file or folder paths to display in chat message, example: {"files": ["/path/to/file1", "/path/to/file2"]}
 - Use "speech" event to send a speech to user, example: {"speech": "hi, this is a speech text"}
 - Use this tool when you want to display generated files, created files, or any file results to the user in the chat message.
  `;
  inputSchema = z.object({
    event: z.enum(['web_preview', 'files_preview', 'get_user_result', 'speech']),
    data: z.string().describe('must be a JSON string'),
  });

  // outputSchema = z.string();

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
        throw new Error('Error: field "url" is required, example: {"url": "http://localhost:3000"}');
      }
      return 'done';
    } else if (event === 'files_preview') {
      if (!value?.files || !isArray(value?.files)) {
        throw new Error('Error: field "files" is required, example: {"files": ["/path/to/file1", "/path/to/file2"]}');
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
    } else if (event === 'speech') {
      if (!value?.speech || !isString(value?.speech) || value?.speech.trim() === '') {
        throw new Error('Error: field "speech" is required, example: {"speech": "hi, this is a speech text"}');
      }
      const speech = value?.speech.trim();
      const speechToText = await toolsManager.buildTool(`${ToolType.BUILD_IN}:${TextToSpeech.toolName}`,)
      const result = await (speechToText as TextToSpeech).execute({
        text: speech,
      });
      const attachments: FileInfo[] = [];
      const fileRegex = /<file>([\s\S]*?)<\/file>/g;
      let match: RegExpExecArray | null;

      // 提取所有 <file>xxx</file> 内容

      while ((match = fileRegex.exec(result)) !== null) {
        const path = match[1];
        const info = await appManager.getFileInfo(path);
        attachments.push(info);
      }


      const audio = player();
      audio.play(attachments[0].path, (err) => {
        if (err) console.error(err);
      });
      return result;
    }
    return 'Error: invalid event';
  };
}
