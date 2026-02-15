import { ImagePart, TextPart, tool } from 'ai';
import { z } from 'zod';
import { isUrl } from '@/utils/is';
import { downloadFile, saveFile } from '@/main/utils/file';
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
import path from 'path';
import { providersManager } from '@/main/providers';
import { Agent } from '@mastra/core/agent';
import { OcrLoader } from '@/main/utils/loaders/ocr-loader';
import { MessagePart } from '@mastra/core/processors';
import { appManager } from '@/main/app';

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
  modelId?: string;
}

// export class Vision extends BaseTool<VisionParams> {
//   static readonly toolName = 'Vision';
//   id: string = 'Vision';
//   description = `
// `;
//   inputSchema = z.strictObject({
//     file_path: z.string().describe('The search query to use'),
//   });
//   outputSchema = z.object({
//     content: z.array(
//       z.object({
//         type: z.enum(['image', 'text']),
//         data: z.string().optional(),
//         image: z.string().optional(),
//         mimeType: z.string().optional(),
//       }),
//     ),
//   });

//   format: 'ai-sdk' = 'ai-sdk';
//   configSchema = ToolConfig.Vision.configSchema;

//   constructor(config?: VisionParams) {
//     super(config);
//   }

//   execute = async (
//     inputData: z.infer<typeof this.inputSchema>,
//     options?: ToolExecutionContext,
//   ) => {
//     const { file_path } = inputData;
//     const config = this.config;

//     // const model = await providersManager.getImageModel(
//     //   this.config?.modelId ?? mode,
//     // );
//     //const response = await model.generate(file_path);
//     // return {
//     //   content: response.images.map((image) => ({
//     //     type: 'image',
//     //     data: image,
//     //   })),
//     // };
//     const mimeType = mime.lookup(file_path);
//     return {
//       content: [
//         {
//           type: 'image',
//           data: fs.readFileSync(file_path).toString('base64'),
//           mimeType: mimeType,
//         },
//       ],
//     };
//   };
// }

export class Vision extends BaseTool<VisionParams> {
  static readonly toolName = 'Vision';
  id: string = 'Vision';
  description = `You MUST use this tool whenever you need to analyze, describe, or extract information from an image,
including when you get an image from user input or any task-related image.

An LLM-powered vision tool that can analyze and interpret image content from local files or URLs based on your instructions.
Only JPEG, PNG, and WebP formats are supported. Other formats (e.g. PDF, GIF, PSD, SVG) are not supported.

Args:
    prompt (str): A text prompt describing what you want to analyze or extract from the image.
    image_source (str): The location of the image to analyze.
        Accepts:
        - HTTP/HTTPS URL: "https://example.com/image.jpg"
        - Local file path:
            - Relative path: "images/photo.png"
            - Absolute path: "/Users/username/Documents/image.jpg"
        Supported formats: JPEG, PNG, WebP

Returns:
    A text description of the image analysis result.
`;
  inputSchema = z.strictObject({
    source: z.string().describe('The location of the image to analyze'),
    prompt: z.string().optional().describe('A text prompt describing what you want to analyze or extract from the image.'),
  });

  format: 'ai-sdk' = 'ai-sdk';
  configSchema = ToolConfig.Vision.configSchema;
  modelId?: string;

  constructor(config?: VisionParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { source, prompt } = inputData;
    const { requestContext } = options;
    const workspace = requestContext.get('workspace' as never) as string;
    const config = this.config;
    const appInfo = await appManager.getInfo();

    if (!this.modelId) {
      this.modelId = appInfo.defaultModel.visionModel;
    }
    if (!this.modelId) {
      throw new Error('Model is not set');
    }

    let file_path: string;
    if (isUrl(source)) {
      const ext = path.extname(source)?.toLowerCase() || 'jpg';
      file_path = await saveFile(source, nanoid() + '.' + ext, workspace);
    } else if (fs.existsSync(source) && fs.statSync(source).isFile()) {
      file_path = source;
    } else {
      throw new Error(`File not found: ${source}`);
    }


    const mimeType = mime.lookup(file_path);
    const provider = await providersManager.getProvider(this.modelId?.split('/')[0]);
    if (mimeType.startsWith('image/')) {
      let ocr
      try {
        const loader = new OcrLoader(file_path, { mode: 'auto' });
        const content = await loader.load();
        ocr = content;
      } catch {

      }
      try {
        const model = provider.languageModel(this.modelId?.split('/').slice(1).join('/'));
        const understandImageAgent = new Agent({
          id: 'understand-image-agent',
          name: 'UnderstandImageAgent',
          instructions: `You are an expert image analysis assistant with exceptional visual perception and interpretation skills.

Your task is to carefully analyze the provided image and respond to the user's prompt accurately and thoroughly.

Guidelines:
- Provide detailed, precise, and well-structured responses based on what you observe in the image.
- If OCR result is already provided in the context, DO NOT repeat or transcribe the text content. Focus on analyzing other visual aspects instead.
- If the user asks you to extract text (OCR) and no OCR result is provided, reproduce the text exactly as it appears, preserving formatting where possible.
- If the user asks for a description, be comprehensive: cover subjects, objects, colors, layout, context, and any notable details.
- If the image contains a flowchart or process diagram, represent it using Mermaid syntax.
- If the image contains charts, tables, or any tabular data, represent the data using Markdown tables.
- If the image contains code, transcribe it accurately and explain it if requested.
- If something in the image is ambiguous or unclear, state your best interpretation and note the uncertainty.
- Always respond in the same language as the user's prompt.
- Do NOT hallucinate or fabricate details that are not visible in the image.
- Only output the analysis result directly. Do NOT include extra suggestions, recommendations, or explanations beyond what is asked.`,
          model: model,
        });

        const input: MessagePart[] = [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: fs.readFileSync(file_path).toString('base64'),
                mimeType: mimeType,
              } as ImagePart,
            ],
          },
        ];
        if (prompt) {
          input.push({
            role: 'user',
            content: prompt,
          });
        }
        if (ocr) {
          input.push({
            role: 'user',
            content: `OCR Result:
${ocr}
`,
          });
        }
        const result = await understandImageAgent.generate(input, {
          abortSignal: options?.abortSignal,
        });
        return `File: <file>${file_path}</file>

<analysis-result>
${result.text}
</analysis-result>

${ocr ? `<ocr-result>
${ocr}
</ocr-result>` : ''}
`;
      } catch {


      }
      if (ocr) {
        return `File: <file>${file_path} </file>
<ocr-result>
${ocr}
</ocr-result>
`
      }
      throw new Error('Failed to analyze image');
    }
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
