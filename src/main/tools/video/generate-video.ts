import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as delay } from 'timers/promises';
import z from 'zod';
// Built-in tools use application singletons, as in GenerateImage.
// eslint-disable-next-line import/no-cycle
import { appManager } from '@/main/app';
// Built-in tools resolve providers through the same manager as GenerateImage.
// eslint-disable-next-line import/no-cycle
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import BaseTool, { BaseToolParams } from '../base-tool';

export interface GenerateVideoParams extends BaseToolParams {
  modelId?: string;
}

const mediaDescription =
  'Public URL, data URI, provider file reference, or local file path (relative to the workspace).';

export class GenerateVideo extends BaseTool {
  static readonly toolName = 'GenerateVideo';

  id = GenerateVideo.toolName;

  description = `Generate a video from a text prompt, optionally using first/last frames or reference media, and save it to a file.
Uses the configured video model, falling back to the default video model in Settings.
This tool creates one generation task and waits internally until it completes, then downloads and saves the video. Call it once; task polling is handled automatically. Waiting can be stopped by the user.
For MiniMax H3: duration 4–15 seconds, resolution 768P/2K. H3 Max: 5–15 seconds, 480P/768P, no reference media. Local media files are uploaded automatically. Stopping attempts to cancel queued tasks; MiniMax cannot cancel running tasks. First/last frames and reference media cannot be mixed.
For Wan 3.0/Prime: duration 2–30 seconds or -1 (automatic), resolution 480P/720P/1080P. Local images use Base64; local video/audio are temporarily uploaded automatically. Existing URLs are passed through unchanged. Reference videos/audio: each 1–15 seconds, combined videos <=15s and combined audio <=15s. Input video plus output duration must be <=30s. Audio generation is enabled and watermark is disabled.
Return the generated file to the user. A pending task is not a completed video.`;

  inputSchema = z.object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe('The prompt to generate the video.'),
    save_path: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Path to save the MP4 video, relative to the workspace or absolute.',
      ),
    duration: z
      .number()
      .int()
      .refine((value) => value === -1 || value > 0)
      .optional()
      .describe(
        'Video duration in seconds; provider default is 5. Wan also accepts -1 for automatic duration.',
      ),
    resolution: z
      .string()
      .optional()
      .describe(
        'Video resolution, e.g. 768P/2K (MiniMax) or 480P/720P/1080P (Wan).',
      ),
    aspect_ratio: z
      .string()
      .optional()
      .describe('Video aspect ratio, e.g. 16:9 or 9:16; frames use adaptive.'),
    first_frame: z
      .string()
      .optional()
      .describe(`First frame image. ${mediaDescription}`),
    last_frame: z
      .string()
      .optional()
      .describe(`Last frame image. ${mediaDescription}`),
    reference_images: z
      .array(z.string())
      .optional()
      .describe(`Reference images. ${mediaDescription}`),
    reference_videos: z
      .array(z.string())
      .optional()
      .describe(`Reference videos. ${mediaDescription}`),
    reference_audios: z
      .array(z.string())
      .optional()
      .describe(`Reference audio files. ${mediaDescription}`),
  });

  configSchema = ToolConfig.GenerateVideo.configSchema;

  modelId?: string;

  constructor(config?: GenerateVideoParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ): Promise<string> => {
    const input = this.inputSchema.parse(inputData);
    const workspace = options?.requestContext?.get('workspace' as never) as
      | string
      | undefined;
    const abortSignal = options?.abortSignal;
    abortSignal?.throwIfAborted();
    const appInfo = await appManager.getInfo();
    const modelId = this.modelId || appInfo.defaultModel.generateVideoModel;
    if (!modelId)
      throw new Error(
        'Video model is not set. Select a default video model in Settings or configure this tool.',
      );
    const [providerId, ...modelParts] = modelId.split('/');
    const modelIdValue = modelParts.join('/');
    if (!providerId || !modelIdValue)
      throw new Error('Invalid video model ID; expected provider/model');
    const provider = await providersManager.getProvider(providerId);
    if (!provider) throw new Error('Video provider not found');
    const videoModel = provider.videoModel?.(modelIdValue);
    if (!videoModel)
      throw new Error(
        'The selected provider does not support video generation',
      );

    // Keep local-file handling in the tool; providers receive transport-ready media.
    const media = async (
      value: string | undefined,
      kind: 'image' | 'video' | 'audio',
    ) => {
      if (!value || /^(https?:\/\/|oss:\/\/|mm_file:\/\/)/i.test(value))
        return value;
      const localRule = videoModel.localMedia?.[kind];
      if (localRule === false)
        throw new Error(
          `The selected video model requires a public URL for ${kind} inputs; local files are not supported`,
        );
      if (
        /^data:/i.test(value) &&
        (localRule?.transport !== 'upload' || localRule.supportsBase64)
      )
        return value;
      const sourcePath = /^file:\/\//i.test(value)
        ? fileURLToPath(value)
        : value;
      const filePath = path.isAbsolute(sourcePath)
        ? sourcePath
        : path.resolve(workspace || '.', sourcePath);
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.heic': 'image/heic',
        '.heif': 'image/heif',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mp3',
      };
      const dataUri = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
      const mime =
        dataUri?.[1] ?? mimeTypes[path.extname(filePath).toLowerCase()];
      if (!mime?.startsWith(`${kind}/`))
        throw new Error(`Unsupported ${kind} input format`);
      if (localRule && !localRule.mimeTypes.includes(mime))
        throw new Error(
          `Unsupported ${kind} format for the selected video model: ${mime}`,
        );
      const maxSize =
        localRule?.maxBytes ??
        { image: 30, video: 50, audio: 15 }[kind] * 1024 * 1024;
      if (dataUri) {
        if (Buffer.byteLength(dataUri[2], 'base64') > maxSize)
          throw new Error(`Oversized ${kind} input`);
      } else {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || !stat.size || stat.size > maxSize)
          throw new Error(`Invalid or oversized ${kind} file: ${filePath}`);
      }
      const bytes = dataUri
        ? Buffer.from(dataUri[2], 'base64')
        : await fs.readFile(filePath, { signal: abortSignal });
      if (bytes.length > maxSize) throw new Error(`Oversized ${kind} input`);
      if (localRule?.transport === 'upload') {
        if (!videoModel.uploadMedia)
          throw new Error(
            'The selected video model does not support file uploads',
          );
        return videoModel.uploadMedia({
          data: bytes,
          fileName: dataUri
            ? `reference.${mime.split('/')[1]}`
            : path.basename(filePath),
          mimeType: mime,
          abortSignal,
        });
      }
      return `data:${mime};base64,${bytes.toString('base64')}`;
    };

    const [
      firstFrame,
      lastFrame,
      referenceImages,
      referenceVideos,
      referenceAudios,
    ] = await Promise.all([
      media(input.first_frame, 'image'),
      media(input.last_frame, 'image'),
      Promise.all(
        (input.reference_images ?? []).map((value) => media(value, 'image')),
      ),
      Promise.all(
        (input.reference_videos ?? []).map((value) => media(value, 'video')),
      ),
      Promise.all(
        (input.reference_audios ?? []).map((value) => media(value, 'audio')),
      ),
    ]);
    let task = await videoModel.doGenerate({
      prompt: input.prompt,
      firstFrame,
      lastFrame,
      referenceImages,
      referenceVideos,
      referenceAudios,
      duration: input.duration,
      resolution: input.resolution,
      aspectRatio: input.aspect_ratio,
      abortSignal,
    });
    try {
      while (task.status === 'queued' || task.status === 'running') {
        abortSignal?.throwIfAborted();
        // Each query depends on the preceding task state.
        // eslint-disable-next-line no-await-in-loop
        task = await videoModel.getTask(task.taskId, { abortSignal });
        if (task.status !== 'queued' && task.status !== 'running') break;
        // eslint-disable-next-line no-await-in-loop
        await delay(videoModel.pollingIntervalMs ?? 5000, undefined, {
          signal: abortSignal,
        });
      }
      abortSignal?.throwIfAborted();
    } catch (error) {
      if (
        abortSignal?.aborted &&
        videoModel.cancelTask &&
        (task.status === 'queued' || task.status === 'running')
      ) {
        try {
          // The user's signal is already aborted; cancellation needs its own bounded request.
          const result = await videoModel.cancelTask(task.taskId, {
            abortSignal: AbortSignal.timeout(15_000),
          });
          await appManager.toast(
            result.cancelled
              ? `Video task ${task.taskId} cancelled`
              : result.message ||
                  `Stopped waiting; video task ${task.taskId} was not cancelled`,
            result.cancelled ? { type: 'success' } : undefined,
          );
        } catch (cancelError) {
          await appManager.toast(
            `Stopped waiting; cancellation failed for video task ${task.taskId}: ${cancelError instanceof Error ? cancelError.message : String(cancelError)}`,
            { type: 'error' },
          );
        }
      }
      throw error;
    }
    if (task.status !== 'succeeded') {
      throw new Error(
        `Video generation ${task.status}: ${task.error || 'No video was produced.'}`,
      );
    }
    if (!task.url)
      throw new Error('Video task succeeded without a download URL');
    const downloadSignal = abortSignal
      ? AbortSignal.any([abortSignal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000);
    const response = await fetch(task.url, { signal: downloadSignal });
    if (!response.ok)
      throw new Error(`Video download failed (HTTP ${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error('Downloaded video is empty');
    abortSignal?.throwIfAborted();
    const filePath = await saveFile(
      buffer,
      input.save_path ?? `${nanoid()}.mp4`,
      workspace,
    );
    return `<file>${filePath}</file>`;
  };
}
