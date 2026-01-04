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

import { isBase64String, isString, isUrl } from '@/utils/is';
import { PNG } from 'pngjs';
import { saveFile, downloadFile } from '@/main/utils/file';
import { ToolConfig } from '@/types/tool';
import { localModelManager } from '@/main/local-model';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';
// import { Blob } from 'node:buffer';

export interface GenerateVideoParams extends BaseToolParams {
  modelId: string;
}
export class GenerateVideo extends BaseTool {
  id: string = 'GenerateVideo';
  description = 'Create a video from a text prompt.';
  inputSchema = z.object({
    prompt: z.string().describe('The prompt to generate the image'),
    save_path: z
      .string()
      .optional()
      .describe('The path to save the image file'),
    size: z
      .string()
      .optional()
      .describe(
        'Optional: Size of the images to generate, format: `{width}x{height}`.',
      ),
    aspect_ratio: z
      .string()
      .optional()
      .describe(
        'Optional: Aspect ratio of the images to generate, format: `{width}:{height}`.',
      ),
  });

  configSchema = ToolConfig.GenerateVideo.configSchema;

  modelId: string;

  constructor(config?: GenerateVideoParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { prompt, save_path, size, aspect_ratio } = inputData;
    const { requestContext } = options;
    const workspace = requestContext.get('workspace' as never) as string;

    const abortSignal = options?.abortSignal as AbortSignal;

    const providerId = this.modelId.split('/').shift();
    const modelId = this.modelId.split('/').slice(1).join('/');

    const provider = await providersManager.getProvider(providerId);
    if (!provider) {
      throw new Error('Provider not found');
    }
    const imageModel = provider.imageModel(modelId);
    const image = await imageModel.doGenerate({
      prompt,
      abortSignal,
      n: 1,
      size: size as `${number}x${number}`,
      aspectRatio: aspect_ratio as `${number}:${number}`,
      seed: 0,
      providerOptions: {
        openai: {
          response_format: 'b64_json',
          // background: 'auto', //transparent, opaque or auto
          // output_format: 'png', // png, jpeg, or webp
        },
      },
    });

    const file_paths = [];
    if (image.images && image.images.length > 0) {
      for (let _image of image.images) {
        const isBase64 = isString(_image) && isBase64String(_image);
        let buffer: Buffer;
        let ext = '.jpg';
        if (isBase64) {
          buffer = Buffer.from(_image, 'base64');
        }
        if (buffer) {
          const { fileTypeFromBuffer } = await import('file-type');
          const type = await fileTypeFromBuffer(buffer);
          ext = '.' + type.ext;
        }
        let file_path;
        if (buffer) {
          file_path = await saveFile(
            buffer,
            save_path ?? nanoid() + ext,
            workspace,
          );
        } else {
          if (typeof _image === 'string') {
            file_path = await saveFile(
              _image,
              save_path ?? nanoid() + ext,
              workspace,
            );
          }
        }
        file_paths.push(file_path);
      }
    }
    return file_paths.map((x) => `<file>${x}</file>`).join('\n');
  };
}
