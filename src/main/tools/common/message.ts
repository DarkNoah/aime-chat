import { ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { appManager } from '@/main/app';
import { isArray, isString } from '@/utils/is';
import { toolsManager } from '..';
import { TextToSpeech } from '../audio';
import { ToolType } from '@/types/tool';
import player from 'play-sound';
import { FileInfo } from '@/types/common';

const fileTagRegex = /<file>([\s\S]*?)<\/file>/g;

async function getFileAttachmentsFromOutput(output: string): Promise<FileInfo[]> {
  const attachments: FileInfo[] = [];
  let match: RegExpExecArray | null;

  while ((match = fileTagRegex.exec(output)) !== null) {
    const filePath = match[1]?.trim();
    if (!filePath) continue;

    const info = await appManager.getFileInfo(filePath);
    if (info?.isExist && info.isFile) {
      attachments.push(info);
    }
  }

  fileTagRegex.lastIndex = 0;
  return attachments;
}

export class Message extends BaseTool {
  static readonly toolName = 'Message';
  id: string = 'Message';
  description = `Send a message event to the user, used to display files, folders, or web preview, get use select result in the chat message.

Usage notes:
 - Use "web_preview" event to send a web preview url event to the web preview panel, example: {"url": "http://localhost:3000"}
 - Use "files_preview" event to send multiple file or folder paths to display in chat message, example: {"files": ["/path/to/file1", "/path/to/file2"]}
 - Use "speech" event to send speakable text to user, example: {"speech": "hi, this is a speech text"}. This text is what the AI wants to say out loud and will be played through the system audio. Keep it natural for TTS; avoid file paths, URLs, code blocks, raw tables, or other text that is difficult to read aloud.
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
    const value = JSON.parse(data);

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
      const speech = value.speech.trim();
      const textToSpeech = await toolsManager.buildTool(`${ToolType.BUILD_IN}:${TextToSpeech.toolName}`);
      const result = await (textToSpeech as TextToSpeech).execute({
        text: speech,
      }, options);
      const attachments = await getFileAttachmentsFromOutput(result);
      if (attachments.length === 0) {
        throw new Error('TextToSpeech did not return a valid audio file.');
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
