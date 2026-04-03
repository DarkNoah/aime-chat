import { Agent } from '@mastra/core/agent';
import { ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import fs from 'fs';
import { ToolConfig, ToolType } from '@/types/tool';
import { providersManager } from '@/main/providers';
import { isUrl } from '@/utils/is';
import { toolsManager } from '..';
import { Read } from '../file-system/read';
import { WebFetch } from '../web/web-fetch';
import { appManager } from '@/main/app';

export interface ExtractParams extends BaseToolParams {
  modelId?: string;
  mode?: 'fast' | 'accurate';
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
    "name": { "type": "string", "description": "The name of the person" },
    "phone_items": { "type": "array", "items": { "type": "string", "description": "The item of the list" } },
    ...
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

  private async readSourceContent(
    source: string,
    options?: ToolExecutionContext,
  ) {
    if (isUrl(source)) {
      const webFetch = await toolsManager.buildTool(
        `${ToolType.BUILD_IN}:${WebFetch.toolName}`,
      );
      return await (webFetch as WebFetch).execute(
        {
          url: source,
        },
        options,
      );
    }

    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error('File not found');
    }

    const read = new Read({
      forcePDFOcr: true,
      forceWordOcr: true,
      disableVision: true,
    });

    console.log('准备OCR文件:', source);
    const result = await read.doRead(
      {
        file_path: source,
      },
      options,
    );

    if (result.isError) {
      throw new Error(result.systemReminder?.join('\n') || 'Error reading file');
    }

    if (!result.content) {
      throw new Error('File content is empty');
    }

    console.log('文件内容:', result.content);
    return result.content;
  }

  private async generateTextExtraction(
    model: Awaited<ReturnType<typeof providersManager.getLanguageModel>>,
    content: string,
    fieldsSchema: Record<string, unknown>,
    options?: ToolExecutionContext,
  ) {
    const extractAgent = new Agent({
      id: 'extract-agent',
      name: 'ExtractAgent',
      instructions: `You are an information extraction expert. Based on the file provided by the user and the fields that need to be extracted, organize the information and infer answers when appropriate.

- The output language should match the user’s input language.
- Do not make up answers arbitrarily.
- You may include your own analysis in plain text.`,
      model,
    });

    const response = await extractAgent.generate(
      [
        {
          role: 'user',
          content: `<content>
${content}
</content>`,
        },
        {
          role: 'user',
          content: `Extract the following fields: \n${JSON.stringify(fieldsSchema, null, 2)}`,
        },
      ],
      {
        abortSignal: options?.abortSignal,
      },
    );

    if (options?.abortSignal?.aborted) {
      throw new Error('Task was aborted by the user.');
    }

    if (response.error) {
      throw new Error(response.error.message);
    }

    const text = response.text;
    if (!text) {
      throw new Error('Extract content is empty');
    }

    console.log('提取内容:', text);
    return text;
  }

  private async generateStructuredExtraction(
    model: Awaited<ReturnType<typeof providersManager.getLanguageModel>>,
    content: string,
    fieldsSchema: Record<string, unknown>,
    options?: ToolExecutionContext,
  ) {
    const extractAgent = new Agent({
      id: 'extract-agent',
      name: 'ExtractAgent',
      instructions: `You are an information extraction expert. Fill missing values with null.`,
      model,
    });

    const response = await extractAgent.generate(
      [
        {
          role: 'user',
          content,
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

    if (options?.abortSignal?.aborted) {
      throw new Error('Task was aborted by the user.');
    }

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.object;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    let modeId = options.requestContext.get('model' as never) as string;
    const { fields, source } = inputData;
    const appInfo = await appManager.getInfo();
    const mode = this.config?.mode || 'accurate';
    modeId = this.config?.modelId || modeId || appInfo.defaultModel.model;
    if (!modeId) {
      throw new Error('Model is not set');
    }

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
    const content = await this.readSourceContent(source, options);

    console.log('准备提取内容...');

    const extractionInput =
      mode === 'accurate'
        ? await this.generateTextExtraction(model, content, fieldsSchema, options)
        : content;

    const o = await this.generateStructuredExtraction(
      model,
      extractionInput,
      fieldsSchema,
      options,
    );
    console.log('提取结果:', o);
    return `${JSON.stringify(o, null, 2)}`;
  };
}
