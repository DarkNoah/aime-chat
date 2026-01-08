import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '@/main/app';
import {
  AutoModel,
  AutoProcessor,
  env,
  RawImage,
} from '@huggingface/transformers';
import { isUrl } from '@/utils/is';
import { PNG } from 'pngjs';
import { saveFile, downloadFile } from '@/main/utils/file';
import { ToolConfig } from '@/types/tool';
import { localModelManager } from '@/main/local-model';
// import { Blob } from 'node:buffer';

export interface RemoveBackgroundParams extends BaseToolParams {
  modelName: string;
}
export class RemoveBackground extends BaseTool {
  static readonly toolName = 'RemoveBackground';
  id: string = 'RemoveBackground';
  description = 'remove background from image, output is a png image file';
  inputSchema = z.object({
    url_or_file_path: z.string().describe('The url or path to the image file'),
    save_path: z
      .string()
      .optional()
      .describe('The path to save the image file'),
  });

  configSchema = ToolConfig.RemoveBackground.configSchema;

  modelName: string;

  constructor(config?: RemoveBackgroundParams) {
    super(config);
    this.modelName = config?.modelName;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { url_or_file_path, save_path } = inputData;
    const { requestContext } = options;
    const abortSignal = options?.abortSignal as AbortSignal;
    const appInfo = await appManager.getInfo();

    // env.localModelPath = path.dirname(modelPath);
    // env.allowRemoteModels = false;
    // env.allowLocalModels = true;

    const modelPath = path.join(appInfo.modelPath, 'other', this.modelName);
    const cacheEntry = await localModelManager.ensureModelLoaded(
      'background-removal',
      this.modelName,
      modelPath,
    );
    const { model, processor } = cacheEntry;

    try {
      let image = null;
      let file_path: string;
      if (isUrl(url_or_file_path)) {
        file_path = await downloadFile(url_or_file_path);
      } else {
        file_path = url_or_file_path;
      }

      if (fs.statSync(file_path).isFile()) {
        const data = await fs.promises.readFile(file_path);
        const blob = new Blob([data]);
        image = await RawImage.fromBlob(blob);
      }
      const ar = image.width / image.height;
      const { pixel_values } = await processor(image);

      let output;
      if (this.modelName == 'rmbg-1.4') {
        output = (await model({ input: pixel_values })).output;
      } else if (this.modelName == 'rmbg-2.0') {
        output = (await model({ pixel_values })).alphas;
      }

      const mask = await RawImage.fromTensor(
        output[0].mul(255).to('uint8'),
      ).resize(image.width, image.height);
      const png = new PNG({ width: image.width, height: image.height });

      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const maskIndex = y * image.width + x;
          const imageIndex = (y * image.width + x) * 3;
          const pngIndex = (y * image.width + x) * 4;
          png.data[pngIndex] = image.data[imageIndex];
          png.data[pngIndex + 1] = image.data[imageIndex + 1];
          png.data[pngIndex + 2] = image.data[imageIndex + 2];
          png.data[pngIndex + 3] = mask.data[maskIndex];
        }
      }
      const encoder = new PNG();
      encoder.data = png.data;
      encoder.width = image.width;
      encoder.height = image.height;
      const buffer = PNG.sync.write(encoder);

      let savePath;
      const workspace = requestContext?.get('workspace' as never) as string;
      if (save_path) {
        savePath = await saveFile(buffer, save_path, workspace);
      } else {
        savePath = await saveFile(buffer, `${nanoid()}.png`, workspace);
      }

      return `<file>${savePath}</file>`;
    } finally {
    }
  };
}
