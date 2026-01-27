import { tool } from 'ai';
import { z } from 'zod';
import { isUrl } from '@/utils/is';
import { downloadFile } from '@/main/utils/file';
import fs from 'fs';
import BaseTool, { BaseToolParams } from '../base-tool';
import { ToolConfig } from '@/types/tool';
import { LanguageModelV2ToolResultPart } from '@ai-sdk/provider';
import { nanoid } from '@/utils/nanoid';
import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import mime from 'mime';

const inputSchema = z.strictObject({
  url_or_file_path: z.string(),
});

// export const Vision = tool<z.infer<typeof inputSchema>, any>({
//   id: 'vercel.weather',
//   description: 'Fetches weather for a location.',
//   inputSchema,
//   execute: async (input: z.infer<typeof inputSchema>, options) => {
//     const { url_or_file_path } = input;
//     let file_path = url_or_file_path;
//     if (isUrl(url_or_file_path)) {
//       file_path = await downloadFile(url_or_file_path);
//     }
//     if (!fs.existsSync(file_path) || !fs.statSync(file_path).isFile()) {
//       throw new Error(`File '${file_path}' does not exist or is not a file.`);
//     }

//     const response = await fetch(`https://wttr.in/${location}?format=3`);
//     const weather = await response.text();

//     return { weather };
//   },
//   toModelOutput(output) {
//     return output.weather;
//   },
// });

export interface VisionParams extends BaseToolParams {
  modeId?: string;
}

export class Vision extends BaseTool<VisionParams> {
  static readonly toolName = 'Vision';
  id: string = 'Vision';
  description = `
`;
  inputSchema = z.strictObject({
    file_path: z.string().describe('The search query to use'),
  });
  outputSchema = z.object({
    content: z.array(
      z.object({
        type: z.enum(['image', 'text']),
        data: z.string().optional(),
        image: z.string().optional(),
        mimeType: z.string().optional(),
      }),
    ),
  });

  format: 'ai-sdk' = 'ai-sdk';
  configSchema = ToolConfig.Vision.configSchema;

  constructor(config?: VisionParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { file_path } = inputData;
    const config = this.config;

    // const model = await providersManager.getImageModel(
    //   this.config?.modelId ?? mode,
    // );
    //const response = await model.generate(file_path);
    // return {
    //   content: response.images.map((image) => ({
    //     type: 'image',
    //     data: image,
    //   })),
    // };
    const mimeType = mime.lookup(file_path);
    return {
      content: [
        {
          type: 'image',
          data: fs.readFileSync(file_path).toString('base64'),
          mimeType: mimeType,
        },
      ],
    };
  };
}
