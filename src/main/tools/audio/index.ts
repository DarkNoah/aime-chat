import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { z } from 'zod';
import ffmpeg from 'fluent-ffmpeg';
import { randomUUID } from 'crypto';
import { ToolExecutionContext } from '@mastra/core/tools';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import {
  getQwenAsrPythonService,
  AudioLoaderOptions,
  TTSOptions,
  AudioLoader,
} from '@/main/utils/loaders/audio-loader';
import { downloadFile, saveFile } from '@/main/utils/file';
import { isUrl } from '@/utils/is';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { providersManager } from '@/main/providers';
import mime from 'mime';
import { TranscriptionModelV2 } from '@mastra/core/_types/@internal_ai-sdk-v5/dist';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.flv',
  '.wmv',
  '.webm',
  '.m4v',
  '.ts',
  '.mts',
  '.m2ts',
]);

const AUDIO_EXTENSIONS = new Set([
  '.wav',
  '.mp3',
  '.flac',
  '.aac',
  '.ogg',
  '.m4a',
  '.wma',
  '.opus',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a video (or non-WAV audio) file to 16 kHz mono WAV using ffmpeg.
 * Returns the path to the temporary WAV file.
 */
function convertToWav(inputPath: string): Promise<string> {
  const outputPath = path.join(app.getPath('temp'), `stt-${randomUUID()}.wav`);

  return new Promise<string>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err: Error) => reject(err))
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

/**
 * Format seconds to ASS timestamp: H:MM:SS.CC
 */
function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sFloor = Math.floor(s);
  const cs = Math.round((s - sFloor) * 100);

  return `${h}:${String(m).padStart(2, '0')}:${String(sFloor).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Format seconds to SRT timestamp: HH:MM:SS,mmm
 */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sFloor = Math.floor(s);
  const ms = Math.round((s - sFloor) * 1000);

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sFloor).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Generate SRT subtitle content from sentence segments.
 */
function generateSrtContent(
  segments: Array<{ startSecond: number; endSecond: number; text: string }>,
): string {
  return (
    segments
      .map((seg, idx) => {
        const start = formatSrtTime(seg.startSecond);
        const end = formatSrtTime(seg.endSecond);
        return `${idx + 1}\n${start} --> ${end}\n${seg.text}`;
      })
      .join('\n\n') + '\n'
  );
}

const ASS_STYLE_FIELDS = [
  'Name',
  'Fontname',
  'Fontsize',
  'PrimaryColour',
  'SecondaryColour',
  'OutlineColour',
  'BackColour',
  'Bold',
  'Italic',
  'Underline',
  'StrikeOut',
  'ScaleX',
  'ScaleY',
  'Spacing',
  'Angle',
  'BorderStyle',
  'Outline',
  'Shadow',
  'Alignment',
  'MarginL',
  'MarginR',
  'MarginV',
  'Encoding',
] as const;

type AssStyleField = (typeof ASS_STYLE_FIELDS)[number];
type AssStyleValues = Record<AssStyleField, string | number>;

const DEFAULT_ASS_STYLE_VALUES: AssStyleValues = {
  Name: 'Default',
  Fontname: 'Arial',
  Fontsize: 60,
  PrimaryColour: '&H00FFFFFF',
  SecondaryColour: '&H000000FF',
  OutlineColour: '&H00000000',
  BackColour: '&H80000000',
  Bold: 0,
  Italic: 0,
  Underline: 0,
  StrikeOut: 0,
  ScaleX: 100,
  ScaleY: 100,
  Spacing: 0,
  Angle: 0,
  BorderStyle: 1,
  Outline: 2,
  Shadow: 1,
  Alignment: 2,
  MarginL: 10,
  MarginR: 10,
  MarginV: 20,
  Encoding: 1,
};

const ASS_STYLE_FIELD_MAP: Record<string, AssStyleField> =
  ASS_STYLE_FIELDS.reduce(
    (acc, field) => {
      acc[field.toLowerCase()] = field;
      return acc;
    },
    {} as Record<string, AssStyleField>,
  );

const ASS_STYLE_KEY_ALIASES: Record<string, AssStyleField> = {
  fontname: 'Fontname',
  fontsize: 'Fontsize',
  primarycolor: 'PrimaryColour',
  primarycolour: 'PrimaryColour',
  secondarycolor: 'SecondaryColour',
  secondarycolour: 'SecondaryColour',
  outlinecolor: 'OutlineColour',
  outlinecolour: 'OutlineColour',
  backcolor: 'BackColour',
  backcolour: 'BackColour',
};

const ASS_STYLE_SUPPORTED_FIELDS = ASS_STYLE_FIELDS.join(', ');

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAssStyleValue(value: unknown): value is string | number | boolean {
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  return typeof value === 'number' && Number.isFinite(value);
}

function getAssStyleField(rawKey: string): AssStyleField | undefined {
  const normalizedKey = rawKey.replace(/[_\-\s]/g, '').toLowerCase();
  return (
    ASS_STYLE_KEY_ALIASES[normalizedKey] ?? ASS_STYLE_FIELD_MAP[normalizedKey]
  );
}

function normalizeAssStyleInput(assStyle: unknown): AssStyleValues {
  if (assStyle === undefined || assStyle === null) {
    return { ...DEFAULT_ASS_STYLE_VALUES };
  }

  let parsedStyle = assStyle;
  if (typeof parsedStyle === 'string') {
    try {
      parsedStyle = JSON.parse(parsedStyle);
    } catch {
      throw new Error('ass_style must be a valid JSON object.');
    }
  }

  if (!isPlainObject(parsedStyle)) {
    throw new Error(
      'ass_style must be a JSON object. Example: {"Fontname":"Arial","Fontsize":20}',
    );
  }

  const normalizedStyle: AssStyleValues = { ...DEFAULT_ASS_STYLE_VALUES };
  const unsupportedKeys: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(parsedStyle)) {
    const assField = getAssStyleField(rawKey);
    if (!assField) {
      unsupportedKeys.push(rawKey);
      continue;
    }

    if (!isAssStyleValue(rawValue)) {
      throw new Error(
        `ass_style.${rawKey} must be string, number, or boolean.`,
      );
    }

    normalizedStyle[assField] =
      typeof rawValue === 'boolean' ? (rawValue ? -1 : 0) : rawValue;
  }

  if (unsupportedKeys.length > 0) {
    throw new Error(
      `Unsupported ass_style fields: ${unsupportedKeys.join(', ')}. Supported fields: ${ASS_STYLE_SUPPORTED_FIELDS}`,
    );
  }

  return normalizedStyle;
}

/**
 * Generate ASS subtitle content from sentence segments.
 */
function generateAssContent(
  segments: Array<{ startSecond: number; endSecond: number; text: string }>,
  styleOptions: AssStyleValues = DEFAULT_ASS_STYLE_VALUES,
): string {
  const styleValues: AssStyleValues = {
    ...DEFAULT_ASS_STYLE_VALUES,
    ...styleOptions,
  };
  const styleName = String(styleValues.Name || 'Default');
  const formatLine = ASS_STYLE_FIELDS.join(', ');
  const styleLine = ASS_STYLE_FIELDS.map((field) =>
    String(styleValues[field]),
  ).join(',');

  const header = `[Script Info]
Title: STT Subtitle
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: ${formatLine}
Style: ${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const dialogueLines = segments.map((seg) => {
    const start = formatAssTime(seg.startSecond);
    const end = formatAssTime(seg.endSecond);
    const text = seg.text.replace(/\n/g, '\\N');
    return `Dialogue: 0,${start},${end},${styleName},,0,0,0,,${text}`;
  });

  return header + '\n' + dialogueLines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// SpeechToText Tool
// ---------------------------------------------------------------------------

export interface SpeechToTextParams extends BaseToolParams {
  modelId?: string;
}

export class SpeechToText extends BaseTool {
  static readonly toolName = 'SpeechToText';
  id: string = 'SpeechToText';
  description = `Transcribe speech from audio or video files to text, SRT subtitles, or ASS subtitles.

Supports:
- Audio files: wav, mp3, flac, aac, ogg, m4a, wma, opus
- Video files: mp4, mkv, avi, mov, flv, wmv, webm (audio will be extracted automatically)
- URL input: HTTP/HTTPS URLs pointing to audio or video files

Output types:
- "text": Returns the transcribed text directly
- "srt": Generates an SRT subtitle file from the transcription and returns the file path
- "ass": Generates an ASS subtitle file from the transcription and returns the file path`;



  configSchema = ToolConfig.SpeechToText.configSchema;

  inputSchema = z.object({
    source: z
      .string()
      .describe(
        'Path to a local audio/video file or a URL pointing to an audio/video resource',
      ),
    output_type: z
      .enum(['text', 'srt', 'ass'])
      .default('text')
      .describe(
        'Output format: "text" for plain text, "srt" for SRT subtitle file, "ass" for ASS subtitle file',
      ),
    save_path: z
      .string()
      .optional()
      .describe(
        'Custom save path for output file (only used when output_type is "srt" or "ass")',
      ),
    ass_style: z
      .record(z.any())
      .optional()
      .describe(
        'Custom ASS style in JSON (any JSON input is accepted by schema and validated in execute). Supports ASS style fields such as Fontname, Fontsize, PrimaryColour, OutlineColour, Alignment, MarginV, etc.',
      ),
  });
  modelId?: string;

  constructor(config?: SpeechToTextParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ) => {
    const { source, output_type, save_path, ass_style } = inputData;
    const workspace =
      (context?.requestContext?.get('workspace' as never) as string) ||
      undefined;

    const tempFiles: string[] = [];

    try {
      // -----------------------------------------------------------------
      // 1. Resolve source to a local file path
      // -----------------------------------------------------------------
      let localPath: string;

      if (isUrl(source)) {
        localPath = await downloadFile(source);
        tempFiles.push(localPath);
      } else {
        if (!fs.existsSync(source)) {
          throw new Error(`File not found: ${source}`);
        }
        localPath = source;
      }

      // -----------------------------------------------------------------
      // 2. Convert video / non-WAV to WAV if needed
      // -----------------------------------------------------------------
      const ext = path.extname(localPath).toLowerCase();
      let audioPath: string;

      if (VIDEO_EXTENSIONS.has(ext)) {
        audioPath = await convertToWav(localPath);
        tempFiles.push(audioPath);
      } else if (AUDIO_EXTENSIONS.has(ext) && ext !== '.wav') {
        // Non-WAV audio – convert for best ASR compatibility
        audioPath = await convertToWav(localPath);
        tempFiles.push(audioPath);
      } else {
        audioPath = localPath;
      }

      // -----------------------------------------------------------------
      // 3. Run ASR transcription (always with timestamps for srt/ass)
      // -----------------------------------------------------------------
      const buffer = await fs.promises.readFile(audioPath);
      // const service = await getQwenAsrPythonService();
      // const asrResult = await service.transcribe(buffer, {
      //   outputType: 'asr',
      //   ext: '.wav',
      //   model: this.modelId?.split('/').pop() || undefined,
      // });

      const provider = await providersManager.getProvider(this.modelId.split('/')[0]);
      let result: Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>;
      if (provider) {
        const transcriptionModel = provider.transcriptionModel(this.modelId.split('/').slice(1).join('/'));
        result = await transcriptionModel.doGenerate({
          audio: buffer,
          mediaType: mime.lookup(audioPath),
          providerOptions: {
            "openai": {
              "timestampGranularities": ["word"]
            }
          }
        });
      } else {
        throw new Error('Provider not found');
      }

      //const result = asrResult.result;
      const text: string = result.text || '';
      // const sentenceSegments: Array<{
      //   start: number;
      //   end: number;
      //   text: string;
      // }> = result. || result.segments || [];

      // -----------------------------------------------------------------
      // 4. Format output based on output_type
      // -----------------------------------------------------------------
      if (output_type === 'text') {
        return text;
      }

      if (output_type === 'srt') {
        if (result.segments.length === 0) {
          return (
            'No timed segments available for SRT generation. Transcribed text: ' +
            text
          );
        }
        const srtContent = generateSrtContent(result.segments);
        const fileName = save_path || `${nanoid()}.srt`;
        const filePath = await saveFile(
          Buffer.from(srtContent, 'utf-8'),
          fileName,
          workspace,
        );
        return `<file>${filePath}</file>`;
      }

      if (output_type === 'ass') {
        if (result.segments.length === 0) {
          return (
            'No timed segments available for ASS generation. Transcribed text: ' +
            text
          );
        }
        const assStyleOptions = normalizeAssStyleInput(ass_style);
        const assContent = generateAssContent(
          result.segments,
          assStyleOptions,
        );
        const fileName = save_path || `${nanoid()}.ass`;
        const filePath = await saveFile(
          Buffer.from(assContent, 'utf-8'),
          fileName,
          workspace,
        );
        return `<file>${filePath}</file>`;
      }

      return text;
    } finally {
      // -----------------------------------------------------------------
      // 5. Cleanup temporary files
      // -----------------------------------------------------------------
      for (const tempFile of tempFiles) {
        try {
          if (fs.existsSync(tempFile)) {
            await fs.promises.rm(tempFile);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// TextToSpeech Tool
// ---------------------------------------------------------------------------

export class TextToSpeech extends BaseTool {
  static readonly toolName = 'TextToSpeech';
  id: string = 'TextToSpeech';
  description = `Convert text to speech audio using Qwen3-TTS models.

Supports multiple modes (selected automatically based on parameters):
1. Custom Voice (voice provided): Uses a predefined speaker with optional emotion/style control via "instruct".
   Available speakers — Chinese: Vivian, Serena, Uncle_Fu, Dylan, Eric; English: Ryan, Aiden
2. Voice Design (instruct provided, NO voice): Creates any voice from a text description (e.g. "a calm, deep male voice with a British accent").
3. Voice Cloning (ref_audio + ref_text provided, NO voice): Clones a voice from a reference audio sample and its transcript.

Output: Returns the path to the generated WAV audio file.`;

  inputSchema = z.object({
    text: z.string().describe('The text content to convert to speech'),
    language: z
      .string()
      .optional()
      .describe(
        'Language for speech synthesis (e.g. "English", "Chinese", "Japanese")',
      ),
    voice: z
      .string()
      .optional()
      .describe(
        'Voice name/identifier for basic TTS mode (e.g. "Chelsie", "Vivian")',
      ),
    instruct: z
      .string()
      .optional()
      .describe(
        'Voice design instruction for custom voice synthesis (e.g. "a calm, deep male voice with a British accent"). When provided, the VoiceDesign model will be used.',
      ),
    ref_audio: z
      .string()
      .optional()
      .describe(
        'Path to a reference audio file for voice cloning. Should be used together with ref_text.',
      ),
    ref_text: z
      .string()
      .optional()
      .describe(
        'Transcript of the reference audio for voice cloning. Should be used together with ref_audio.',
      ),
    save_path: z
      .string()
      .optional()
      .describe(
        'Custom file name or path for the output audio file. If not provided, a random name will be generated.',
      ),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ) => {
    const { text, language, voice, instruct, ref_audio, ref_text, save_path } =
      inputData;
    const workspace =
      (context?.requestContext?.get('workspace' as never) as string) ||
      undefined;

    // Validate ref_audio / ref_text pairing
    if (ref_audio && !ref_text) {
      throw new Error(
        'ref_text is required when ref_audio is provided for voice cloning.',
      );
    }

    // If ref_audio is a URL, download it first
    let resolvedRefAudio: string | undefined = ref_audio;
    const tempFiles: string[] = [];

    try {
      if (ref_audio && isUrl(ref_audio)) {
        resolvedRefAudio = await downloadFile(ref_audio);
        tempFiles.push(resolvedRefAudio);
      } else if (ref_audio) {
        if (!fs.existsSync(ref_audio)) {
          throw new Error(`Reference audio file not found: ${ref_audio}`);
        }
        resolvedRefAudio = ref_audio;
      }

      // Generate output path in temp directory, then move to final location
      const tempOutputPath = path.join(
        app.getPath('temp'),
        `tts-${randomUUID()}.wav`,
      );

      const service = await getQwenAsrPythonService();
      const result = await service.synthesize({
        text,
        language,
        voice,
        instruct,
        ref_audio: resolvedRefAudio,
        ref_text,
        outputPath: tempOutputPath,
      });

      // Move to final save location
      const fileName = save_path || `${nanoid()}.wav`;
      const buffer = await fs.promises.readFile(result.outputPath);
      const filePath = await saveFile(buffer, fileName, workspace);

      // Cleanup temp output
      if (fs.existsSync(result.outputPath) && result.outputPath !== filePath) {
        await fs.promises.rm(result.outputPath).catch(() => { });
      }

      return `Generated speech audio (${result.duration.toFixed(1)}s, ${result.sampleRate}Hz) saved to: \n<file>${filePath}</file>`;
    } finally {
      for (const tempFile of tempFiles) {
        try {
          if (fs.existsSync(tempFile)) {
            await fs.promises.rm(tempFile);
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// AudioToolkit
// ---------------------------------------------------------------------------

export interface AudioToolkitParams extends BaseToolkitParams { }

export class AudioToolkit extends BaseToolkit {
  static readonly toolName = 'AudioToolkit';
  id: string = 'AudioToolkit';

  constructor(params?: AudioToolkitParams) {
    super([new SpeechToText(params?.[SpeechToText.toolName] ?? {}), new TextToSpeech(params?.[TextToSpeech.toolName] ?? {})], params);
  }

  getTools() {
    return this.tools;
  }
}

export default AudioToolkit;
