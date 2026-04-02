import { Agent } from '@mastra/core/agent';
import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import fs from 'fs';
import path from 'path';
import { ToolConfig, ToolType } from '@/types/tool';
import { providersManager } from '@/main/providers';
import { isUrl } from '@/utils/is';
import { toolsManager } from '..';
import { Read, ReadBinaryFile } from '../file-system/read';
import { WebFetch } from '../web/web-fetch';
import { appManager } from '@/main/app';

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
\`\`\`json
{
  "type": "object",
  "properties": {
    "name": { "type": "string", "description": "The name of the person" }
  },
  "required": ["name"],
}
\`\`\`

properties's key must use english


Returns:
 a json object from input fields
`;
  inputSchema = z.strictObject({
    fields: z.string().describe('Extract JsonSchema'),
    source: z
      .string()
      .describe('The absolute path to the file to extract or the url'),
  });

  configSchema = ToolConfig.Extract.configSchema;

  constructor(config?: ExtractParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    let modeId = options.requestContext.get('model' as never) as string;
    const { fields, source } = inputData;
    const appInfo = await appManager.getInfo();
    modeId = this.config?.modelId || modeId || appInfo.defaultModel.model;
    if (!modeId) {
      throw new Error('Model is not set');
    }


    // if((save_format && !save_path) || (!save_format && save_path)) {
    //   throw new Error('save_format and save_path must be provided together');
    // }
    // if(save_format == 'json' && !save_path.endsWith('.json')) {
    //   throw new Error('save_path must end with .json');
    // }
    // if(save_format == 'csv' && !save_path.endsWith('.csv')) {
    //   throw new Error('save_path must end with .csv');
    // }
    // if(save_format == 'excel' && !save_path.endsWith('.xlsx')) {
    //   throw new Error('save_path must end with .xlsx');
    // }



    let fieldsSchema;
    try {
      fieldsSchema = JSON.parse(fields);
    } catch (error) {
      return {
        error: 'Invalid fields schema',
      };
    }

    const model = await providersManager.getLanguageModel(
      modeId
    );
    const config = this.config;

    const extractAgent = new Agent({
      id: 'extract-agent',
      name: 'ExtractAgent',
      instructions:
        'You are an assistant specialized in extracting key extractions from text. ',
      model: model,
    });
    let content = '';

    if (isUrl(source)) {
      const webFetch = await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${WebFetch.toolName}`,
      );
      content = await (webFetch as WebFetch).execute(
        {
          url: source,
        },
        options,
      );
    } else if (
      fs.existsSync(source) &&
      fs.statSync(source).isFile()
    ) {
      const read = await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${Read.toolName}`,
      );
      console.log('准备OCR文件:', source);
      content = await (read as Read).execute(
        {
          file_path: source,
        },
        options,
      );

      console.log('文件内容:', content);
    } else {
      throw new Error('File not found');
    }

    console.log('准备提取内容...');
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
          schema: fieldsSchema,
          jsonPromptInjection: true,
        },
        abortSignal: options?.abortSignal,
      },
    );
    if (options?.abortSignal.aborted) {
      throw new Error('Task was aborted by the user.');
    }
    const o = response.object;
    console.log('提取结果:', o);
    return `${JSON.stringify(o, null, 2)}`;
  };
}
