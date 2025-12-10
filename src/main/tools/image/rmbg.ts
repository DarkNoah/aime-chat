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

// const models: Record<string, CachedModel> = {};
// const modelLoadPromises: Record<string, Promise<CachedModel>> = {};

// async function ensureModelLoaded(modelName: string, modelPath: string) {
//   if (models[modelName]) {
//     return models[modelName];
//   }

//   if (!modelLoadPromises[modelName]) {
//     modelLoadPromises[modelName] = (async () => {
//       const [model, processor] = await Promise.all([
//         AutoModel.from_pretrained(modelPath, {
//           local_files_only: true,
//         }),
//         AutoProcessor.from_pretrained(modelPath, {}),
//       ]);

//       const entry: CachedModel = {
//         model,
//         processor,
//         lastUsed: Date.now(),
//         activeCount: 0,
//       };

//       models[modelName] = entry;
//       return entry;
//     })();
//   }

//   const entry = await modelLoadPromises[modelName];
//   delete modelLoadPromises[modelName];
//   return entry;
// }

// function scheduleModelRelease(modelName: string) {
//   const entry = models[modelName];
//   if (!entry) {
//     return;
//   }

//   if (entry.releaseTimer) {
//     clearTimeout(entry.releaseTimer);
//   }

//   entry.releaseTimer = setTimeout(() => {
//     entry.releaseTimer = undefined;
//     void releaseModelIfIdle(modelName);
//   }, MODEL_RELEASE_DELAY_MS);
// }

// async function releaseModelIfIdle(modelName: string) {
//   const entry = models[modelName];
//   if (!entry) {
//     return;
//   }

//   const idleTime = Date.now() - entry.lastUsed;
//   if (idleTime < MODEL_RELEASE_DELAY_MS || entry.activeCount > 0) {
//     scheduleModelRelease(modelName);
//     return;
//   }

//   try {
//     await entry.model?.dispose?.();
//   } catch (error) {
//     console.warn(`[RemoveBackground] 释放模型 ${modelName} 失败`, error);
//   } finally {
//     delete models[modelName];
//   }
// }

export class RemoveBackground extends BaseTool {
  id: string = 'RemoveBackground';
  description = '测试工具';
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
