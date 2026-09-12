import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import fs from 'fs/promises';
import path from 'path';
import z from 'zod';
// Built-in tools resolve configured providers through the shared manager.
// eslint-disable-next-line import/no-cycle
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import BaseTool, { BaseToolParams } from '../base-tool';

export interface MusicGenerationParams extends BaseToolParams {
  modelId?: string;
}

export class MusicGeneration extends BaseTool {
  static readonly toolName = 'MusicGeneration';

  id = MusicGeneration.toolName;

  description =
    'Generate music from a prompt, optionally with lyrics or as instrumental music, and save the completed audio to a local file. Select a music model in the tool configuration before use. MiniMax can generate lyrics automatically when lyrics are omitted.';

  inputSchema = z.object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe('Describe the music style, mood and scene.'),
    lyrics: z
      .string()
      .optional()
      .describe(
        'Optional song lyrics, with sections such as [Verse] and [Chorus].',
      ),
    is_instrumental: z
      .boolean()
      .optional()
      .describe('Generate instrumental music without vocals.'),
    format: z
      .enum(['mp3', 'wav'])
      .optional()
      .describe('Output audio format; defaults to MP3.'),
    save_path: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Output path, absolute or relative to the workspace.'),
  });

  configSchema = ToolConfig.MusicGeneration.configSchema;

  modelId?: string;

  constructor(config?: MusicGenerationParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ): Promise<string> => {
    const input = this.inputSchema.parse(inputData);
    const abortSignal = context?.abortSignal;
    abortSignal?.throwIfAborted();
    if (!this.modelId)
      throw new Error(
        'Select a music model in the MusicGeneration tool configuration',
      );
    const [providerId, ...parts] = this.modelId.split('/');
    if (!providerId || !parts.join('/'))
      throw new Error('Invalid music model ID; expected provider/model');
    const provider = await providersManager.getProvider(providerId);
    if (!provider) throw new Error('Music provider not found');
    const musicModel = provider.musicModel?.(parts.join('/'));
    if (!musicModel)
      throw new Error(
        'The selected provider does not support music generation',
      );
    const format = input.format ?? 'mp3';
    const result = await musicModel.doGenerate({
      prompt: input.prompt,
      lyrics: input.lyrics,
      is_instrumental: input.is_instrumental,
      format,
      abortSignal,
    });
    abortSignal?.throwIfAborted();
    if (typeof result !== 'string' || !result)
      throw new Error(
        'Music provider did not return an audio URL or local file',
      );
    let audio: Buffer;
    if (/^https?:\/\//i.test(result)) {
      const response = await fetch(result, {
        signal: abortSignal
          ? AbortSignal.any([abortSignal, AbortSignal.timeout(120_000)])
          : AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw new Error(`Music download failed (HTTP ${response.status})`);
      audio = Buffer.from(await response.arrayBuffer());
    } else {
      if (!path.isAbsolute(result))
        throw new Error('Music provider returned an invalid audio file path');
      audio = await fs.readFile(result, { signal: abortSignal });
    }
    if (!audio.length) throw new Error('Generated music audio is empty');
    abortSignal?.throwIfAborted();
    const workspace = context?.requestContext?.get('workspace' as never) as
      | string
      | undefined;
    const filePath = await saveFile(
      audio,
      input.save_path ?? `${nanoid()}.${format}`,
      workspace,
    );
    return `Generated music saved to: \n<file>${filePath}</file>`;
  };
}
