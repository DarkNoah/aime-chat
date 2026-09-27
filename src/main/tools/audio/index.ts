import { MusicGeneration } from './music-generation';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { z } from 'zod';
import ffmpeg from 'fluent-ffmpeg';
import { randomUUID } from 'crypto';
import { ToolExecutionContext } from '@mastra/core/tools';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { downloadFile, saveFile } from '@/main/utils/file';
import { isObject, isString, isUrl } from '@/utils/is';
import { nanoid } from '@/utils/nanoid';
import { ToolConfig } from '@/types/tool';
import { providersManager } from '@/main/providers';
import mime from 'mime';
import type { SpeechModelV2, TranscriptionModelV2 } from '@ai-sdk/provider';
import type { UrlTranscriptionModel } from '@/types/transcription';
import { appManager } from '@/main/app';
import { truncateText } from '@/utils/common';

export { MusicGeneration } from './music-generation';
export type { MusicGenerationParams } from './music-generation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPTION_OUTPUT_LINES = 1000;

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
  '.oga',
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

type SubtitleSegment = {
  startSecond: number;
  endSecond: number;
  text: string;
  speaker?: string;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeTimedSegments(rawSegments: unknown): SubtitleSegment[] {
  if (!Array.isArray(rawSegments)) return [];

  return rawSegments
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined;
      const record = item as Record<string, unknown>;
      const text = String(record.text ?? '').trim();
      const startSecond = toFiniteNumber(
        record.startSecond ?? record.start ?? record.start_time,
      );
      const endSecond = toFiniteNumber(
        record.endSecond ?? record.end ?? record.end_time,
      );

      if (!text || startSecond === undefined || endSecond === undefined) {
        return undefined;
      }
      return { startSecond, endSecond, text };
    })
    .filter((seg): seg is SubtitleSegment => Boolean(seg));
}

/**
 * Build subtitle-level segments from word-level alignments.
 *
 * Input assumptions:
 * - `asrText` is the full transcription **with punctuation** (e.g. "你好，世界。")
 * - `alignmentSegments` are word-level tokens **without punctuation**, each
 *   carrying `startSecond` / `endSecond` / `text`.
 *
 * Two-pass strategy:
 *
 * Pass 1 — "punctuation split":
 *   Greedy-match alignment tokens to ASR text, detect punctuation boundaries,
 *   split at every strong punct (.!?。！？) and every weak punct (,;:、，；：…).
 *   This produces fine-grained "clause" segments that respect natural language
 *   boundaries. Display text is extracted from the raw ASR string so commas,
 *   question marks, etc. are preserved while deciding boundaries. Trailing
 *   punctuation/symbols are stripped only from the final subtitle segments.
 *
 * Pass 2 — "join continuations / split large":
 *   Treat weak punctuation and brief within-sentence pauses as soft boundaries.
 *   Join consecutive clauses within the width/duration budget, but never cross
 *   a sentence ending, speaker change or long pause. Split oversized clauses
 *   repeatedly at punctuation or a word boundary near the midpoint.
 *
 * Prefer complete phrases without cutting alignment tokens or rewriting ASR.
 * A single oversized token cannot be split without inventing timestamps.
 */
export function buildSentenceSegments(
  asrText: string,
  alignmentSegments: SubtitleSegment[],
): SubtitleSegment[] {
  if (alignmentSegments.length === 0) return [];

  // -- Punctuation sets --
  const STRONG_END = new Set('.!?\u3002\uff01\uff1f');
  const WEAK_BREAK = new Set(',;:\u3001\uff0c\uff1b\uff1a\u2026');
  const ALL_PUNCT = new Set([...STRONG_END, ...WEAK_BREAK]);
  const cleanSegments = (segments: SubtitleSegment[]): SubtitleSegment[] =>
    segments
      .map((segment) => ({
        ...segment,
        // Unicode punctuation/symbols cover both Chinese and English. Include
        // emoji presentation selectors/joiners so symbol sequences strip fully.
        text: segment.text.replace(/[\p{P}\p{S}\s\uFE0E\uFE0F\u200D]+$/u, ''),
      }))
      .filter((segment) => segment.text.length > 0);

  // -- Sizing constants --
  const MAX_UNITS = 30;
  const MAX_DURATION = 8.0;
  const GAP_BREAK_SEC = 0.5;
  const MAX_CONTINUATION_GAP_SEC = 0.8;

  const normChar = (ch: string): string =>
    ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;

  const isSkippable = (ch: string): boolean =>
    /\s/.test(ch) || ALL_PUNCT.has(ch);

  /** Estimate display width: CJK=1, latin/digit=0.5, other=0.7 */
  const estimateUnits = (text: string): number => {
    let u = 0;
    for (const ch of text) {
      if (/\s/.test(ch)) continue;
      if (
        /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(ch)
      )
        u += 1;
      else if (/[a-zA-Z0-9]/.test(ch)) u += 0.5;
      else if (ALL_PUNCT.has(ch)) u += 0.2;
      else u += 0.7;
    }
    return u;
  };

  // =====================================================================
  // Step 1: Map each alignment token → raw ASR string range
  // =====================================================================
  const asrChars = Array.from(asrText);

  const asrClean: string[] = [];
  const asrCleanToRaw: number[] = [];
  for (let i = 0; i < asrChars.length; i += 1) {
    const ch = asrChars[i];
    if (isSkippable(ch)) continue;
    asrClean.push(normChar(ch));
    asrCleanToRaw.push(i);
  }

  const tokenRawStart: Array<number | undefined> = new Array(
    alignmentSegments.length,
  ).fill(undefined);
  const tokenRawEnd: Array<number | undefined> = new Array(
    alignmentSegments.length,
  ).fill(undefined);

  let asrPtr = 0;
  for (let tokenIdx = 0; tokenIdx < alignmentSegments.length; tokenIdx += 1) {
    for (const ch of alignmentSegments[tokenIdx].text) {
      if (isSkippable(ch)) continue;
      const target = normChar(ch);
      while (asrPtr < asrClean.length && asrClean[asrPtr] !== target) {
        asrPtr += 1;
      }
      if (asrPtr >= asrClean.length) break;
      const rawIdx = asrCleanToRaw[asrPtr];
      if (tokenRawStart[tokenIdx] === undefined) tokenRawStart[tokenIdx] = rawIdx;
      tokenRawEnd[tokenIdx] = rawIdx;
      asrPtr += 1;
    }
  }

  // =====================================================================
  // Step 2: Classify boundary type after each token
  // =====================================================================
  type BoundaryType = 'none' | 'weak' | 'strong';

  const tokenBoundary: BoundaryType[] = new Array(
    alignmentSegments.length,
  ).fill('none');

  for (let i = 0; i < alignmentSegments.length; i += 1) {
    const endRaw = tokenRawEnd[i];
    if (endRaw === undefined) continue;

    let upperRaw = asrChars.length;
    for (let j = i + 1; j < alignmentSegments.length; j += 1) {
      if (tokenRawStart[j] !== undefined) {
        upperRaw = tokenRawStart[j] as number;
        break;
      }
    }

    let found: BoundaryType = 'none';
    for (let r = endRaw + 1; r < upperRaw; r += 1) {
      const ch = asrChars[r];
      if (/\s/.test(ch)) continue;
      if (STRONG_END.has(ch)) { found = 'strong'; break; }
      if (WEAK_BREAK.has(ch)) found = 'weak';
    }
    tokenBoundary[i] = found;
  }

  // =====================================================================
  // Step 3: Extract display text from raw ASR for a token range
  // =====================================================================
  const extractText = (startTok: number, endTok: number): string => {
    let rawStart: number | undefined;
    let rawEnd: number | undefined;
    for (let t = startTok; t <= endTok; t += 1) {
      if (tokenRawStart[t] !== undefined && rawStart === undefined) {
        rawStart = tokenRawStart[t];
      }
      if (tokenRawEnd[t] !== undefined) rawEnd = tokenRawEnd[t];
    }
    if (rawStart === undefined || rawEnd === undefined) {
      // Fallback: join token texts
      const hasCjk = alignmentSegments
        .slice(startTok, endTok + 1)
        .some((s) => /[\u4e00-\u9fff]/.test(s.text));
      return alignmentSegments
        .slice(startTok, endTok + 1)
        .map((s) => s.text)
        .join(hasCjk ? '' : ' ')
        .trim();
    }

    // Extend rawEnd to absorb trailing punct (not into next token's chars)
    let upperRaw = asrChars.length;
    for (let j = endTok + 1; j < alignmentSegments.length; j += 1) {
      if (tokenRawStart[j] !== undefined) {
        upperRaw = tokenRawStart[j] as number;
        break;
      }
    }
    while (rawEnd + 1 < upperRaw) {
      const ch = asrChars[rawEnd + 1];
      if (/\s/.test(ch) || ALL_PUNCT.has(ch)) rawEnd += 1;
      else break;
    }

    return asrChars.slice(rawStart, rawEnd + 1).join('').trim();
  };

  // =====================================================================
  // Pass 1: Split at every punctuation boundary + gap → clause segments
  // =====================================================================
  type ClauseSegment = {
    startTok: number;
    endTok: number;
    startSecond: number;
    endSecond: number;
  };

  const clauses: ClauseSegment[] = [];
  let clauseStart = 0;

  for (let i = 0; i < alignmentSegments.length; i += 1) {
    const isLast = i === alignmentSegments.length - 1;
    const boundary = tokenBoundary[i];
    const gapToNext = isLast
      ? 0
      : alignmentSegments[i + 1].startSecond - alignmentSegments[i].endSecond;

    const shouldSplit =
      isLast ||
      alignmentSegments[i].speaker !== alignmentSegments[i + 1]?.speaker ||
      boundary === 'strong' ||
      boundary === 'weak' ||
      gapToNext >= GAP_BREAK_SEC;

    if (shouldSplit) {
      clauses.push({
        startTok: clauseStart,
        endTok: i,
        startSecond: alignmentSegments[clauseStart].startSecond,
        endSecond: alignmentSegments[i].endSecond,
      });
      clauseStart = i + 1;
    }
  }

  if (clauses.length === 0) {
    return cleanSegments(
      alignmentSegments.map((seg) => ({ ...seg, text: seg.text.trim() })),
    );
  }

  // =====================================================================
  // Pass 2a: Join same-speaker continuations within the reading budget
  // =====================================================================
  const merged: ClauseSegment[] = [];
  let acc: ClauseSegment | undefined;

  for (const clause of clauses) {
    if (!acc) {
      acc = { ...clause };
      continue;
    }

    const combinedText = extractText(acc.startTok, clause.endTok);
    const gap = clause.startSecond - acc.endSecond;

    if (
      tokenBoundary[acc.endTok] !== 'strong' &&
      gap <= MAX_CONTINUATION_GAP_SEC &&
      estimateUnits(combinedText) <= MAX_UNITS &&
      clause.endSecond - acc.startSecond <= MAX_DURATION &&
      alignmentSegments[acc.startTok].speaker ===
        alignmentSegments[clause.startTok].speaker
    ) {
      // A comma/short pause alone does not make a complete subtitle.
      acc.endTok = clause.endTok;
      acc.endSecond = clause.endSecond;
    } else {
      merged.push(acc);
      acc = { ...clause };
    }
  }
  if (acc) merged.push(acc);

  // =====================================================================
  // Pass 2b: Split oversized segments at best interior boundary
  // =====================================================================
  const finalSegments: SubtitleSegment[] = [];
  const pending = [...merged].reverse();

  while (pending.length > 0) {
    const seg = pending.pop()!;
    const text = extractText(seg.startTok, seg.endTok);
    const units = estimateUnits(text);
    const duration = seg.endSecond - seg.startSecond;

    if (units <= MAX_UNITS && duration <= MAX_DURATION) {
      if (text) {
        finalSegments.push({
          startSecond: seg.startSecond,
          endSecond: seg.endSecond,
          speaker: alignmentSegments[seg.startTok].speaker,
          text,
        });
      }
      continue;
    }

    // Need to split — find best split point among interior tokens
    // Prefer: 1) punctuation boundary nearest to midpoint, 2) any token nearest midpoint
    const midUnits = units / 2;
    let runUnits = 0;
    let bestPunctSplit = -1;
    let bestPunctDist = Infinity;
    let bestAnySplit = -1;
    let bestAnyDist = Infinity;

    for (let t = seg.startTok; t < seg.endTok; t += 1) {
      const tokText = alignmentSegments[t].text;
      runUnits += estimateUnits(tokText);

      const dist = Math.abs(runUnits - midUnits);

      if (tokenBoundary[t] !== 'none' && dist < bestPunctDist) {
        bestPunctDist = dist;
        bestPunctSplit = t;
      }
      if (dist < bestAnyDist) {
        bestAnyDist = dist;
        bestAnySplit = t;
      }
    }

    const splitAt = bestPunctSplit >= 0 ? bestPunctSplit : bestAnySplit;

    if (splitAt >= 0 && splitAt < seg.endTok) {
      // Push right first so the stack emits subtitles in chronological order.
      pending.push(
        {
          startTok: splitAt + 1,
          endTok: seg.endTok,
          startSecond: alignmentSegments[splitAt + 1].startSecond,
          endSecond: seg.endSecond,
        },
        {
          startTok: seg.startTok,
          endTok: splitAt,
          startSecond: seg.startSecond,
          endSecond: alignmentSegments[splitAt].endSecond,
        },
      );
    } else {
      // Can't split further, emit as-is
      if (text) {
        finalSegments.push({
          startSecond: seg.startSecond,
          endSecond: seg.endSecond,
          speaker: alignmentSegments[seg.startTok].speaker,
          text,
        });
      }
    }
  }

  return cleanSegments(
    finalSegments.length > 0 ? finalSegments : alignmentSegments,
  );
}

/**
 * Generate SRT subtitle content from sentence segments.
 */
function generateSrtContent(
  segments: SubtitleSegment[],
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
  segments: SubtitleSegment[],
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
    return `Dialogue: 0,${start},${end},${styleName},${seg.speaker || ''},0,0,0,,${text}`;
  });

  return header + '\n' + dialogueLines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// SpeechToText Tool
// ---------------------------------------------------------------------------

function formatTranscriptionOutput(
  text: string,
  duration?: number,
  savePath?: string,
) {
  const reminders: string[] = [];
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    reminders.push(`This audio file duration is ${duration.toFixed(2)}s.`);
  }
  if (savePath) reminders.push(`File saved to: <file>${savePath}</file>`);
  const reminder = reminders.length
    ? `<system-reminder>\n${reminders.join('\n')}\n</system-reminder>\n`
    : '';
  return truncateText(
    `${reminder}<transcription-text>\n${text}\n</transcription-text>`,
    MAX_TRANSCRIPTION_OUTPUT_LINES,
    'lines',
  );
}

export interface SpeechToTextParams extends BaseToolParams {
  modelId?: string;
}

export class SpeechToText extends BaseTool {
  static readonly toolName = 'SpeechToText';
  id: string = 'SpeechToText';
  description = `Transcribe audio/video to readable text, structured JSON, SRT, or ASS.
Supports local paths and HTTP/HTTPS URLs; video audio is extracted automatically.
Audio: wav, mp3, flac, aac, ogg, oga, m4a, wma, opus. Video: mp4, mkv, avi, mov, flv, wmv, webm.

Missing local models:
Read skill:local:aime-chat-docs (references/local-models.md) and use its scripts/local_models.py to download missing models before retrying. Do not silently fall back to diarize=false.
For Pyannote: python "\${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" download --type diarization --model-id pyannote/speaker-diarization-community-1
Verify completion with: python "\${AIME_CHAT_SKILL_PATH}/aime-chat-docs/scripts/local_models.py" list --type diarization
For a missing local STT model, use the same script with --type stt and the exact model ID from the error/catalog (without the local/ provider prefix).
The script defaults to ModelScope; omit --timeout. Wait for isDownloaded=true, then retry SpeechToText. This uses the Local Models module to download actual weights; inference itself never downloads them. The script requires the Aime Chat local API server and AIME_CHAT_API_BASE_URL as documented in the skill.

diarize defaults to false. Set diarize=true to label speakers with local Pyannote Community-1. It requires ASR timestamps; local Qwen3 ASR uses word alignment. Speaker labels such as SPEAKER_00 are anonymous, not identities; unmatched segments use UNKNOWN. Other providers are assigned at their returned timestamp granularity.

Output formats and examples:
save_path supports every format. With a nonempty path, save the complete native file (.txt/.srt/.ass/.json) before returning the preview. Relative paths use the workspace. For text/JSON, omitted/null/empty save_path means no file and no save-path field/message. SRT/ASS keep an auto-generated filename when save_path is empty. Text/subtitle previews are limited to 1000 lines; saved files and JSON objects are complete.

1. output_type="text", diarize=true, save_path="/path_to_file.txt". Returns a string directly:
<system-reminder>
This audio file duration is 71.98s.
File saved to: <file>/path_to_file.txt</file>
</system-reminder>
<transcription-text>
[SPEAKER_00] 你好，请问今天想喝点什么呢
[SPEAKER_01] 一杯咖啡，谢谢
</transcription-text>
The saved .txt contains only the transcript, including speaker labels. With diarize=false, transcript lines are plain text, e.g. "你好，请问今天想喝点什么呢" without speaker labels. Without save_path, omit the File saved to line. Duration is shown to two decimals when available.

2. output_type="srt", diarize=true, save_path="/path_to_file.srt":
<system-reminder>
This audio file duration is 71.98s.
File saved to: <file>/path_to_file.srt</file>
</system-reminder>
<transcription-text>
1
00:00:00,560 --> 00:00:01,920
[SPEAKER_00] 你好，请问今天想喝点什么呢

2
00:00:02,000 --> 00:00:03,000
[SPEAKER_01] 一杯咖啡，谢谢
</transcription-text>
With diarize=false, a cue is:
1
00:00:00,560 --> 00:00:01,920
你好，请问今天想喝点什么呢

3. output_type="ass", diarize=true, save_path="/path_to_file.ass". The same reminder/transcription-text layout is used; complete ASS header and styles are saved and previewed. Dialogue excerpt:
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.56,0:00:01.92,Default,SPEAKER_00,0,0,0,,你好，请问今天想喝点什么呢
Dialogue: 0,0:00:02.00,0:00:03.00,Default,SPEAKER_01,0,0,0,,一杯咖啡，谢谢
Speaker IDs go in Name; Text never contains injected [SPEAKER_00] labels. With diarize=false, Name is empty:
Dialogue: 0,0:00:00.56,0:00:01.92,Default,,0,0,0,,你好，请问今天想喝点什么呢
ass_style optionally customizes ASS styles.

4. output_type="json", diarize=true, save_path="/path_to_file.json" returns this object and saves the same JSON:
{"savePath":"/path_to_file.json","diarize":true,"duration":71.981,"segments":[{"start":0.56,"end":1.92,"text":"你好，请问今天想喝点什么呢","speaker":"SPEAKER_00"},{"start":2,"end":3,"text":"一杯咖啡，谢谢","speaker":"SPEAKER_01"}]}
With diarize=false and no save_path:
{"diarize":false,"duration":71.981,"segments":[{"start":0.56,"end":1.92,"text":"你好，请问今天想喝点什么呢"},{"start":2,"end":3,"text":"一杯咖啡，谢谢"}]}
All four formats use the same subtitle-level segments and split on speaker changes. Strip all trailing punctuation and symbols from each final segment (Chinese/English included), preserving punctuation inside the segment. JSON uses seconds, preserves duration precision, and omits speaker when diarize=false. savePath is omitted when no file is requested. Unknown duration is null; missing timestamps give segments=[] when diarize=false. JSON has no transcript tags or extra format/text/language fields.

Example call with speaker separation: {"source":"meeting.wav","output_type":"json","diarize":true}.
If diarize=true and ASR provides no timestamps, the tool fails with a clear message. With diarize=false, SRT/ASS without timestamps return a text explanation instead of fabricating a subtitle file.`;



  configSchema = ToolConfig.SpeechToText.configSchema;

  inputSchema = z.object({
    source: z
      .string()
      .describe(
        'Path to a local audio/video file or a URL pointing to an audio/video resource',
      ),
    diarize: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Separate speakers with local Pyannote. Text/SRT use [SPEAKER_00] labels; ASS uses the Name field without labels in Text; JSON segments include speaker. Requires ASR timestamps. If the model is missing, use skill:local:aime-chat-docs scripts/local_models.py to download it, verify isDownloaded=true, then retry.',
      ),
    output_type: z
      .enum(['text', 'json', 'srt', 'ass'])
      .default('text')
      .describe(
        'Output format: "text" for readable text, "json" for duration and timed segments (speaker fields when diarize=true), "srt" for an SRT file, "ass" for an ASS file. All formats support save_path. See tool description for examples.',
      ),
    save_path: z
      .string()
      .nullish()
      .describe(
        'Save the complete output to this path for any format (.txt, .json, .srt, .ass). Relative paths use the workspace. Omitted, null or empty: text/JSON do not save a file; SRT/ASS use an auto-generated filename.',
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
    inputData: z.input<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ) => {
    const {
      source,
      output_type: outputType,
      save_path,
      ass_style,
      diarize,
    } = this.inputSchema.parse(inputData);
    context?.abortSignal?.throwIfAborted();
    const workspace =
      (context?.requestContext?.get('workspace' as never) as string) ||
      undefined;
    const appInfo = await appManager.getInfo();
    const modelId = this.modelId || appInfo?.defaultModel?.transcriptionModel;

    if (!modelId) {
      throw new Error('Model is not set');
    }
    const tempFiles: string[] = [];
    let diarization:
      | Awaited<
          ReturnType<
            (typeof import('@/main/utils/speaker-diarization'))['acquireSpeakerDiarization']
          >
        >
      | undefined;
    let audioPath: string | undefined;

    try {
      if (diarize) {
        const { acquireSpeakerDiarization } =
          await import('@/main/utils/speaker-diarization');
        diarization = await acquireSpeakerDiarization();
        context?.abortSignal?.throwIfAborted();
      }
      const provider = await providersManager.getProvider(modelId.split('/')[0]);
      if (!provider) throw new Error('Provider not found');
      const transcriptionModel = provider.transcriptionModel?.(
        modelId.split('/').slice(1).join('/'),
      ) as UrlTranscriptionModel | undefined;
      if (!transcriptionModel)
        throw new Error('The selected provider does not support transcription');
      let result: Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>;
      if (
        !diarize &&
        isUrl(source) &&
        transcriptionModel.doGenerateFromUrl &&
        (transcriptionModel.canGenerateFromUrl?.(source) ?? true)
      ) {
        result = await transcriptionModel.doGenerateFromUrl({
          url: source,
          abortSignal: context?.abortSignal,
        });
      } else {
        // -----------------------------------------------------------------
        // 1. Resolve source to a local file path
        // -----------------------------------------------------------------
        let localPath: string;

        if (isUrl(source)) {
          localPath = await downloadFile(source);
          tempFiles.push(localPath);
        } else {
          localPath = path.isAbsolute(source)
            ? source
            : path.resolve(workspace || '.', source);
          if (!fs.existsSync(localPath)) {
            throw new Error(`File not found: ${localPath}`);
          }
        }

        // -----------------------------------------------------------------
        // 2. Convert video / non-WAV to WAV if needed
        // -----------------------------------------------------------------
        const ext = path.extname(localPath).toLowerCase();

        if (VIDEO_EXTENSIONS.has(ext)) {
          audioPath = await convertToWav(localPath);
          tempFiles.push(audioPath);
        } else if ((diarize || AUDIO_EXTENSIONS.has(ext)) && ext !== '.wav') {
          // Non-WAV audio �?convert for best ASR compatibility
          audioPath = await convertToWav(localPath);
          tempFiles.push(audioPath);
        } else {
          audioPath = localPath;
        }

        // -----------------------------------------------------------------
        // 3. Run ASR transcription (always with timestamps for srt/ass)
        // -----------------------------------------------------------------
        const buffer = await fs.promises.readFile(audioPath, {
          signal: context?.abortSignal,
        });

        result = await transcriptionModel.doGenerate({
          audio: buffer,
          mediaType: mime.lookup(audioPath) || 'audio/wav',
          abortSignal: context?.abortSignal,
          providerOptions: {
            openai: { timestampGranularities: ['word'] },
            ...(diarize ? { local: { wordTimestamps: true } } : {}),
          },
        });
      }
      context?.abortSignal?.throwIfAborted();

      //const result = asrResult.result;
      let text: string = result.text || '';
      const timedSegments = normalizeTimedSegments(
        (result as { segments?: unknown }).segments,
      );
      if (diarization) {
        if (text.trim() && timedSegments.length === 0) {
          throw new Error(
            'Speaker diarization requires transcription timestamps. Select a timestamp-capable STT model (for example local Qwen3 ASR), or set diarize=false.',
          );
        }
        if (timedSegments.length) {
          const turns = await diarization.run(audioPath!, context?.abortSignal);
          const { speakerForSegment } =
            await import('@/main/utils/speaker-diarization');
          for (const segment of timedSegments) {
            segment.speaker = speakerForSegment(
              segment.startSecond,
              segment.endSecond,
              turns,
            );
          }
        }
      }
      const requestedSavePath = save_path?.trim()
        ? path.resolve(workspace || app.getPath('temp'), save_path)
        : undefined;
      // All formats share the same subtitle boundaries, including speaker changes.
      const subtitleSegments = buildSentenceSegments(text, timedSegments);
      if (outputType === 'json') {
        const output = {
          ...(requestedSavePath ? { savePath: requestedSavePath } : {}),
          diarize,
          duration: result.durationInSeconds ?? null,
          segments: subtitleSegments.map((segment) => ({
            start: segment.startSecond,
            end: segment.endSecond,
            text: segment.text,
            ...(diarize ? { speaker: segment.speaker || 'UNKNOWN' } : {}),
          })),
        };
        if (requestedSavePath) {
          await saveFile(
            Buffer.from(JSON.stringify(output, null, 2), 'utf-8'),
            requestedSavePath,
            workspace,
          );
        }
        return output;
      }
      const labeledSegments = subtitleSegments.map((segment) => ({
        ...segment,
        text: diarize
          ? `[${segment.speaker || 'UNKNOWN'}] ${segment.text}`
          : segment.text,
      }));
      if (outputType === 'text') {
        text = timedSegments.length
          ? labeledSegments.map((segment) => segment.text).join('\n')
          : text;
        const savedPath = requestedSavePath
          ? await saveFile(
              Buffer.from(text, 'utf-8'),
              requestedSavePath,
              workspace,
            )
          : undefined;
        return formatTranscriptionOutput(text, result.durationInSeconds, savedPath);
      }
      if (subtitleSegments.length === 0) {
        return truncateText(
          `No timed segments available for ${outputType.toUpperCase()} generation. Transcribed text: ${text}`,
          MAX_TRANSCRIPTION_OUTPUT_LINES,
          'lines',
        );
      }
      const fileContent =
        outputType === 'srt'
          ? generateSrtContent(labeledSegments)
          : generateAssContent(
              subtitleSegments,
              normalizeAssStyleInput(ass_style),
            );
      const savedPath = await saveFile(
        Buffer.from(fileContent, 'utf-8'),
        requestedSavePath || `${nanoid()}.${outputType}`,
        workspace,
      );
      return formatTranscriptionOutput(
        fileContent,
        result.durationInSeconds,
        savedPath,
      );
    } finally {
      diarization?.release();
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

  toModelOutput = (output: any) => {
    if (isObject(output) && 'segments' in output && 'diarize' in output) {
      return { type: 'json', value: output };
    }
    if (isString(output))
      return truncateText(output, MAX_TRANSCRIPTION_OUTPUT_LINES, 'lines');
    if (isObject(output) && 'text' in output) {
      return {
        type: 'text',
        value: formatTranscriptionOutput(
          output.text,
          output.durationInSeconds,
          output.savePath,
        ),
      };
    }
  };
}

// ---------------------------------------------------------------------------
// TextToSpeech Tool
// ---------------------------------------------------------------------------

export interface TextToSpeechParams extends BaseToolParams {
  modelId?: string;
}

export class TextToSpeech extends BaseTool {
  static readonly toolName = 'TextToSpeech';
  id: string = 'TextToSpeech';
  description = `Convert text to a WAV audio file using the configured speech model.
Supports voice design, voice cloning, and expressive speech when supported by the selected model.
Read skill:local:audiogen for model-specific prompts, voice controls, and Chinese/English vocal event syntax.
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
        'Existing voice name or identifier supported by the selected model.',
      ),
    instruct: z
      .string()
      .optional()
      .describe(
        'Voice design or speech delivery instruction when supported by the selected model.',
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
  configSchema = ToolConfig.TextToSpeech.configSchema;
  modelId?: string;

  constructor(config?: TextToSpeechParams) {
    super(config);
    this.modelId = config?.modelId;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context?: ToolExecutionContext,
  ) => {
    const { text, language, voice, instruct, ref_audio, ref_text, save_path } =
      this.inputSchema.parse(inputData);
    context?.abortSignal?.throwIfAborted();
    const workspace =
      (context?.requestContext?.get('workspace' as never) as string) ||
      undefined;

    // Validate ref_audio / ref_text pairing
    if (ref_audio && !ref_text) {
      throw new Error(
        'ref_text is required when ref_audio is provided for voice cloning.',
      );
    }
    const appInfo = await appManager.getInfo();
    const modelId = this.modelId || appInfo?.defaultModel?.speechModel;
    if (!modelId) {
      throw new Error(
        'No speech model is configured. Select a model in the TextToSpeech tool configuration or Settings > Default Model > Default Speech Model. For local speech, first download a TTS model in Settings > Local Models, then select it and retry.',
      );
    }
    const [providerId, ...modelParts] = modelId.split('/');
    const provider = await providersManager.getProvider(providerId);
    if (!provider) {
      throw new Error(
        `Speech provider "${providerId}" is unavailable. Configure it in Settings > Providers, or select another speech model in the TextToSpeech tool configuration or Settings > Default Model > Default Speech Model, then retry.`,
      );
    }
    const speechModel = provider.speechModel?.(modelParts.join('/'));
    if (!speechModel) {
      throw new Error(
        `Provider "${providerId}" does not support the selected speech model. Select a supported speech model in the TextToSpeech tool configuration or Settings > Default Model > Default Speech Model, then retry.`,
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
        resolvedRefAudio = path.isAbsolute(ref_audio)
          ? ref_audio
          : path.resolve(workspace || process.cwd(), ref_audio);
        if (!fs.existsSync(resolvedRefAudio)) {
          throw new Error(`Reference audio file not found: ${ref_audio}`);
        }
      }

      // Generate output path in temp directory, then move to final location
      const tempOutputPath = path.join(
        app.getPath('temp'),
        `tts-${randomUUID()}.wav`,
      );

      const _result: Awaited<ReturnType<SpeechModelV2['doGenerate']>> =
        await speechModel.doGenerate({
          text,
          language,
          voice,
          instructions: instruct,
          outputFormat: 'wav',
          abortSignal: context?.abortSignal,
          providerOptions: {
            "local": {
              "ref_audio": resolvedRefAudio,
              "ref_text": ref_text,
              "outputPath": tempOutputPath,
            },
            "openai": {
              "speed": 1.0,
              "response_format": "wav",
            }
          },
        });

      context?.abortSignal?.throwIfAborted();

      // Move to final save location
      const fileName = save_path || `${nanoid()}.wav`;
      let buffer: Uint8Array;
      if (isString(_result.audio)) {
        buffer = await fs.promises.readFile(_result.audio);
      } else {
        buffer = _result.audio as Uint8Array;
      }
      if (!buffer?.byteLength) throw new Error('Speech model returned empty audio');
      context?.abortSignal?.throwIfAborted();
      const filePath = await saveFile(Buffer.from(buffer), fileName, workspace);

      // Cleanup temp output
      const outputPath: string = _result.providerMetadata?.['local']?.outputPath as string;

      if (typeof outputPath === 'string' && fs.existsSync(outputPath) && outputPath !== filePath) {
        await fs.promises.rm(outputPath).catch(() => { });
      }

      const metadata = Object.values(_result.providerMetadata ?? {})[0];
      const sampleRate = metadata?.sampleRate;
      const duration = metadata?.duration;
      const details = [
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? `${duration.toFixed(1)}s` : undefined,
        typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0
          ? `${sampleRate}Hz` : undefined,
      ].filter(Boolean).join(', ');
      return `Generated speech audio${details ? ` (${details})` : ''} saved to: \n<file>${filePath}</file>`;
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

export interface ListVoicesParams extends BaseToolParams { }

type VoiceItem = {
  id: string;
  audioPath: string;
  text: string;
};

export class ListVoices extends BaseTool {
  static readonly toolName = 'ListVoices';
  id: string = 'ListVoices';
  description = `List available cloned voices from the user data voices directory.

Each voice is stored under userData/voices/<voice-id> and must contain both audio.wav and audio.txt. Incomplete voice folders are skipped.`;

  inputSchema = z.object({});

  execute = async (_inputData: z.infer<typeof this.inputSchema>) => {
    const voicesPath = path.join(app.getPath('userData'), 'voices');
    const voices: VoiceItem[] = [];

    if (!fs.existsSync(voicesPath)) {
      return { voicesPath, voices };
    }

    const entries = await fs.promises.readdir(voicesPath, {
      withFileTypes: true,
    });

    for (const entry of entries
      .filter((item) => item.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const voiceDir = path.join(voicesPath, entry.name);
      const audioPath = path.join(voiceDir, 'audio.wav');
      const textPath = path.join(voiceDir, 'audio.txt');

      if (!fs.existsSync(audioPath) || !fs.existsSync(textPath)) {
        continue;
      }

      try {
        const text = await fs.promises.readFile(textPath, 'utf-8');
        voices.push({
          id: entry.name,
          audioPath,
          text,
        });
      } catch {
        continue;
      }
    }

    return { voicesPath, voices };
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
    super([
      new ListVoices(params?.[ListVoices.toolName] ?? {}),
      new SpeechToText(params?.[SpeechToText.toolName] ?? {}),
      new TextToSpeech(params?.[TextToSpeech.toolName] ?? {}),
      new MusicGeneration(params?.[MusicGeneration.toolName] ?? {})], params);
  }

  getTools() {
    return this.tools;
  }
}

export default AudioToolkit;
