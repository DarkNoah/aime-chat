import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '@/main/app';

import { isBase64String, isString, isUrl } from '@/utils/is';
import { PNG } from 'pngjs';
import { saveFile, downloadFile } from '@/main/utils/file';
import { ToolConfig, ToolType } from '@/types/tool';
import { localModelManager } from '@/main/local-model';
import { providersManager } from '@/main/providers';
import { ProviderType } from '@/types/provider';
import { RemoveBackground } from './rmbg';
import { toolsManager } from '..';

export interface EditImageParams extends BaseToolParams {
  modelId: string;
}
export class EditImage extends BaseTool {
  static readonly toolName = 'EditImage';
  id: string = 'EditImage';
  description = `Edit a specific image file using a natural language prompt and optional reference images to guide the transformation.
- If you need to remove the image background, make sure the prompt includes a description of a clean background.

Prompt Templates (high hit-rate)
Use templates when the user is vague or when edits must be precise.

Editing template (preserve everything else):
"Change ONLY: <single change>. Keep identical: subject, composition/crop, pose, lighting, color palette, background, text, and overall style. Do not add new objects. If text exists, keep it unchanged."

Returns:
- A list of image file paths.
  example:
    <file>/path_to_save/image.jpg</file>
    <file>/path_to_save/image2.jpg</file>`;

  inputSchema = z.object({
    prompt: z
      .string()
      .describe('A text description of the image you want to generate'),
    images: z
      .array(z.string())
      .optional()
      .describe('Input images to transform or use as reference'),
    save_path: z
      .string()
      .optional()
      .describe('The path to save the image file'),
    aspect_ratio: z
      .string()
      .optional()
      .describe(
        'Optional: Aspect ratio of the images to generate, format: `{width}:{height}`.',
      ),
    size: z
      .string()
      .optional()
      .describe(
        'Optional: Size of the images to generate, format: `{width}x{height}`.',
      ),
    remove_background: z.boolean().optional().default(false).describe('Optional remove the background of the image, and save_path will be changed to .png format'),
  });

  configSchema = ToolConfig.EditImage.configSchema;

  modelId: string;

  constructor(config?: EditImageParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { prompt, images, save_path, size, aspect_ratio, remove_background } = inputData;
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
      prompt: images.length == 0 ? prompt : { text: prompt, images },
      abortSignal,
      n: 1,
      size: (size as `${number}x${number}`) || undefined,
      aspectRatio: (aspect_ratio as `${number}:${number}`) || undefined,
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
    try {
      if (remove_background === true) {
        const removeBackgroundTool = await toolsManager.buildTool(`${ToolType.BUILD_IN}:${RemoveBackground.toolName}`);
        const results = [];
        for (let file_path of file_paths) {
          const save_path = renameWithSuffix(file_path, '_rmbg', '.png');
          const result = await (removeBackgroundTool as RemoveBackground).execute({
            file_path_or_url: file_path,
            save_path: save_path
          }, options);
          results.push(save_path);
        }
        return results.map((x) => `<file>${x}</file>`).join('\n');
      }
    } catch {

    }
    return file_paths.map((x) => `<file>${x}</file>`).join('\n');
  };
}

function renameWithSuffix(filePath: string, suffix: string, newExt: string) {
  if (!newExt.startsWith(".")) {
    newExt = "." + newExt;
  }
  const { dir, name } = path.parse(filePath);
  return path.join(dir, `${name}${suffix}${newExt}`);
}
