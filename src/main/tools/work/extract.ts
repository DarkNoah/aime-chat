import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import fs from 'fs';
import path from 'path';
import { ToolConfig } from '@/types/tool';
import { providersManager } from '@/main/providers';
import { isUrl } from '@/utils/is';

export interface ExtractParams extends BaseToolParams {
  modelId?: string;
  maxChunkSize?: number;
}

export class Extract extends BaseTool<ExtractParams> {
  static readonly toolName = 'Extract';
  id: string = 'Extract';
  description = `Extracting key extractions from text.

Supported file formats:
- Plain text file (.txt, ...)
- Markdown file (.md)
- HTML file (.html)
- PDF file (.pdf)
- Word file (.docx, .doc)
- PowerPoint file (.pptx, .ppt)
- Image file (.jpg, .jpeg, .png, .bmp, .webp)
- Video file (.mp4, .mov, .avi, .mkv, .webm)
- Audio file (.mp3, .wav, .m4a, .ogg, .aac)

fields is a json schema string:
example:
{
  type: "object",
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
}

Returns:
 a json object from input fields
`;
  inputSchema = z.strictObject({
    fields: z.string().describe('Extract JsonSchema'),
    file_path_or_url: z
      .string()
      .describe('The absolute path to the file to extract or the url'),
    save_path: z
      .string()
      .optional()
      .describe('The path to save the extracted data'),
  });

  configSchema = ToolConfig.Extract.configSchema;

  constructor(config?: ExtractParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { fields, file_path_or_url } = inputData;

    const model = await providersManager.getLanguageModel(this.config.modelId);
    const config = this.config;

    const extractAgent = new Agent({
      id: 'extract-agent',
      name: 'ExtractAgent',
      instructions:
        'You are an assistant specialized in extracting key extractions from text. ',
      model: model,
    });
    const content = '';

    if (isUrl(file_path_or_url)) {
    } else if (
      fs.existsSync(file_path_or_url) &&
      fs.statSync(file_path_or_url).isFile()
    ) {
    }

    const response = await extractAgent.generate(
      [
        {
          role: 'user',
          content: `<content>
${content}
</content>`,
        },
      ],
      {
        structuredOutput: {
          schema: JSON.parse(fields),
          jsonPromptInjection: true,
        },
      },
    );
    const o = response.object;

    return JSON.stringify(o, null, 2);
  };
}
