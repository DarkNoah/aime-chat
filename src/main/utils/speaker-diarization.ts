import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { z } from 'zod';
// SpeechToText imports this module lazily after managers have initialized.
// eslint-disable-next-line import/no-cycle
import { localModelManager } from '@/main/local-model';
import { DIARIZATION_MODEL_ID } from '@/main/local-model/diarization-models';
import { getUVRuntime } from '@/main/app/runtime';
import { getAssetPath } from './index';
import { runCommand } from './shell';

const turnsSchema = z.array(
  z
    .object({
      start: z.number().finite().nonnegative(),
      end: z.number().finite().nonnegative(),
      speaker: z.string().regex(/^SPEAKER_\d+$/),
    })
    .refine((turn) => turn.end > turn.start),
);

export type SpeakerTurn = z.infer<typeof turnsSchema>[number];

/** Acquire before ASR or downloading input; inference never downloads weights. */
export async function acquireSpeakerDiarization() {
  const lease = await localModelManager.acquireAudioModel(
    'diarization',
    DIARIZATION_MODEL_ID,
  );
  try {
    const uv = await getUVRuntime(true);
    if (!uv?.installed || uv.status !== 'installed' || !uv.dir) {
      throw new Error(
        'Speaker diarization requires the UV runtime. Install it in Settings > Runtime first.',
      );
    }
    const executable = path.join(
      uv.dir,
      process.platform === 'win32' ? 'uv.exe' : 'uv',
    );
    return {
      release: lease.release,
      run: async (
        audioPath: string,
        abortSignal?: AbortSignal,
      ): Promise<SpeakerTurn[]> => {
        abortSignal?.throwIfAborted();
        const directory = await fs.mkdtemp(
          path.join(app.getPath('temp'), 'aime-diarization-'),
        );
        try {
          const outputPath = path.join(directory, 'turns.json');
          const args = [
            executable,
            'run',
            '--no-project',
            '--no-config',
            '--python',
            '3.12',
            '--script',
            getAssetPath('runtime', 'pyannote', 'diarize.py'),
            '--model',
            lease.modelPaths[DIARIZATION_MODEL_ID],
            '--audio',
            audioPath,
            '--output',
            outputPath,
          ];
          const windows = process.platform === 'win32';
          const quote = (arg: string) =>
            windows
              ? `'${arg.replace(/'/g, "''")}'`
              : `'${arg.replace(/'/g, "'\"'\"'")}'`;
          const command = `${windows ? '& ' : ''}${args.map(quote).join(' ')}${windows ? '; exit $LASTEXITCODE' : ''}`;
          const result = await runCommand(command, {
            cwd: directory,
            usePowerShell: windows,
            abortSignal,
            env: {
              HF_HUB_OFFLINE: '1',
              TRANSFORMERS_OFFLINE: '1',
              PYANNOTE_METRICS_ENABLED: '0',
            },
          });
          abortSignal?.throwIfAborted();
          if (result.code !== 0) {
            throw new Error(
              `Pyannote speaker diarization failed: ${(result.stderr || result.error?.message || 'Runtime failed').slice(-4000)}`,
            );
          }
          return turnsSchema.parse(
            JSON.parse(await fs.readFile(outputPath, 'utf8')),
          );
        } finally {
          await fs.rm(directory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    lease.release();
    throw error;
  }
}

/** Attribute only overlapping speech; do not invent identities across silence. */
export function speakerForSegment(
  start: number,
  end: number,
  turns: SpeakerTurn[],
) {
  const overlaps = new Map<string, number>();
  for (const turn of turns) {
    const overlap = Math.max(
      0,
      Math.min(end, turn.end) - Math.max(start, turn.start),
    );
    if (overlap > 0)
      overlaps.set(turn.speaker, (overlaps.get(turn.speaker) || 0) + overlap);
  }
  return [...overlaps].sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';
}
