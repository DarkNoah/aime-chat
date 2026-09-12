import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import z from 'zod';
// Built-in tools resolve configured providers through the shared manager.
// eslint-disable-next-line import/no-cycle
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import BaseTool, { BaseToolParams } from '../base-tool';

export interface Generate3DParams extends BaseToolParams {
  modelId?: string;
}

export class Generate3D extends BaseTool {
  static readonly toolName = 'Generate3D';

  id = Generate3D.toolName;

  description = `Generate a 3D model from text, one image, or 2–4 images of different views. Choose exactly one of prompt or images. Textures and PBR materials are always enabled.
Select a 3D model in the tool configuration. Tripo H3.1 and P1.0 require Alibaba Beijing region.
Tripo images can be public HTTP(S) URLs, uploaded oss:// references, or local JPEG/PNG paths (absolute, file://, or relative to the workspace). Local images are uploaded automatically. Each image must be <=20 MB and 20–6000 pixels on each side. A single image needs no view label. For multiple images, label each view front/left/back/right; missing views are handled automatically. For URLs without a file extension, specify format.
This tool creates one task, waits for completion and saves GLB models and available preview images. Do not submit the same task again or pass task_id. Stopping cancels local waiting; the server task may continue.`;

  inputSchema = z.object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Text description, only for text-to-3D. Tripo accepts up to 1024 characters.',
      ),
    images: z
      .array(
        z.object({
          view: z.enum(['front', 'left', 'back', 'right']).optional(),
          image: z
            .string()
            .trim()
            .min(1)
            .describe('Image URL or local file path for this view.'),
          format: z
            .enum(['jpeg', 'png'])
            .optional()
            .describe(
              'Image format; inferred from URL extension when omitted.',
            ),
        }),
      )
      .min(1)
      .max(4)
      .optional()
      .describe(
        '1 image for single-image-to-3D, or 2–4 distinct labeled views of the same object for multi-image-to-3D.',
      ),
    texture_quality: z.enum(['standard', 'detailed']).optional(),
    geometry_quality: z
      .enum(['standard', 'ultra'])
      .optional()
      .describe('Tripo H3.1 only. Omit for P1.0.'),
    save_path: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'GLB output path, absolute or relative to the workspace. Defaults to a generated filename.',
      ),
  });

  configSchema = ToolConfig.Generate3D.configSchema;

  modelId?: string;

  constructor(config?: Generate3DParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ): Promise<string> => {
    const input = this.inputSchema.parse(inputData);
    if (
      [input.prompt, input.images].filter((value) => value !== undefined)
        .length !== 1
    )
      throw new Error('Specify exactly one of prompt or images');
    if (
      input.images?.length > 1 &&
      (input.images.some(({ view }) => !view) ||
        new Set(input.images.map(({ view }) => view)).size !==
          input.images.length)
    )
      throw new Error(
        'Each image in multi-image generation must have a distinct view',
      );
    if (
      input.save_path &&
      path.extname(input.save_path).toLowerCase() !== '.glb'
    )
      throw new Error('save_path must end in .glb');
    const signal = context?.abortSignal;
    signal?.throwIfAborted();
    if (!this.modelId)
      throw new Error('Select a 3D model in the Generate3D tool configuration');
    const [providerId, ...parts] = this.modelId.split('/');
    if (!providerId || !parts.join('/'))
      throw new Error('Invalid 3D model ID; expected provider/model');
    const provider = await providersManager.getProvider(providerId);
    if (!provider) throw new Error('3D provider not found');
    const model = provider.model3d?.(parts.join('/'));
    if (!model)
      throw new Error('The selected provider does not support 3D generation');
    const workspace = context?.requestContext?.get('workspace' as never) as
      | string
      | undefined;
    const prepared = await Promise.all(
      (input.images ?? []).map(async (item) => {
        if (/^(https?:\/\/|oss:\/\/)/i.test(item.image))
          return { ...item, upload: undefined };
        if (/^data:/i.test(item.image))
          throw new Error('Use a local image path or URL for 3D generation');
        if (!model.uploadImage)
          throw new Error(
            'The selected 3D provider does not support local image uploads',
          );
        const source = /^file:\/\//i.test(item.image)
          ? fileURLToPath(item.image)
          : item.image;
        const filePath = path.isAbsolute(source)
          ? source
          : path.resolve(workspace || '.', source);
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || !stat.size || stat.size > 20 * 1024 * 1024)
          throw new Error('3D image must be a non-empty file up to 20 MB');
        const data = await fs.readFile(filePath, { signal });
        if (data.length > 20 * 1024 * 1024)
          throw new Error('3D image exceeds 20 MB');
        const metadata = await sharp(data).metadata();
        if (
          !['jpeg', 'png'].includes(metadata.format) ||
          !metadata.width ||
          !metadata.height ||
          metadata.width < 20 ||
          metadata.height < 20 ||
          metadata.width > 6000 ||
          metadata.height > 6000
        )
          throw new Error(
            'Tripo requires JPEG/PNG images with width and height between 20 and 6000 pixels',
          );
        const format = metadata.format as 'jpeg' | 'png';
        if (item.format && item.format !== format)
          throw new Error(
            'Declared image format does not match the local image',
          );
        signal?.throwIfAborted();
        return {
          ...item,
          format,
          upload: {
            data,
            fileName: `${path.parse(filePath).name}.${format}`,
            mimeType: `image/${format}`,
            abortSignal: signal,
          },
        };
      }),
    );
    // Validate all local files before starting uploads.
    const images = await Promise.all(
      prepared.map(async ({ upload, ...item }) => ({
        ...item,
        image: upload ? await model.uploadImage(upload) : item.image,
      })),
    );
    signal?.throwIfAborted();
    let task = await model.doGenerate({
      prompt: input.prompt,
      image: images.length === 1 ? images[0].image : undefined,
      images:
        images.length > 1
          ? images.map(({ view, image, format }) => ({
              view,
              image,
              format,
            }))
          : undefined,
      textured: true,
      textureQuality: input.texture_quality,
      geometryQuality: input.geometry_quality,
      abortSignal: signal,
    });
    while (task.status === 'queued' || task.status === 'running') {
      // Poll once per interval; never create a replacement task while waiting.
      // eslint-disable-next-line no-await-in-loop
      await delay(model.pollingIntervalMs ?? 15000, undefined, { signal });
      signal?.throwIfAborted();
      // eslint-disable-next-line no-await-in-loop
      task = await model.getTask(task.taskId, { abortSignal: signal });
    }
    signal?.throwIfAborted();
    if (task.status !== 'succeeded')
      throw new Error(
        `3D generation ${task.status}: ${task.error || 'No model was produced'}`,
      );
    if (!task.results?.length)
      throw new Error('3D task succeeded without model results');
    const outputPath = input.save_path || `${nanoid()}.glb`;
    const stem = outputPath.slice(0, -4);
    const saved: string[] = [];
    const download = async (url: string) => {
      if (!/^https?:\/\//i.test(url))
        throw new Error('3D provider returned an invalid download URL');
      const response = await fetch(url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
          : AbortSignal.timeout(120000),
      });
      if (!response.ok)
        throw new Error(`3D file download failed (HTTP ${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('Downloaded 3D file is empty');
      signal?.throwIfAborted();
      return buffer;
    };
    for (const [index, result] of task.results.entries()) {
      const name = task.results.length > 1 ? `${stem}-${index + 1}` : stem;
      // eslint-disable-next-line no-await-in-loop
      const bytes = await download(result.url);
      // eslint-disable-next-line no-await-in-loop
      const file = await saveFile(bytes, `${name}.glb`, workspace);
      saved.push(`<file>${file}</file>`);
      if (result.previewUrl) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const preview = await download(result.previewUrl);
          const extension = path
            .extname(new URL(result.previewUrl).pathname)
            .toLowerCase();
          if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
            throw new Error('Unknown preview image format');
          // eslint-disable-next-line no-await-in-loop
          const previewFile = await saveFile(
            preview,
            `${name}-preview${extension}`,
            workspace,
          );
          saved.push(`<file>${previewFile}</file>`);
        } catch (error) {
          signal?.throwIfAborted();
          saved.push(
            `Model saved; preview could not be saved: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
    return saved.join('\n');
  };
}
