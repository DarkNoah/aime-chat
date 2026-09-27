/** @jest-environment node */
import fs from 'fs/promises';
import { localModelManager } from '@/main/local-model';
import { getUVRuntime } from '@/main/app/runtime';
import { runCommand } from './shell';
import {
  acquireSpeakerDiarization,
  speakerForSegment,
} from './speaker-diarization';

jest.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
jest.mock('@/main/local-model', () => ({
  localModelManager: { acquireAudioModel: jest.fn() },
}));
jest.mock('@/main/app/runtime', () => ({ getUVRuntime: jest.fn() }));
jest.mock('./index', () => ({
  getAssetPath: (...parts: string[]) => `/assets/${parts.join('/')}`,
}));
jest.mock('./shell', () => ({ runCommand: jest.fn() }));

const release = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(localModelManager.acquireAudioModel).mockResolvedValue({
    modelPaths: {
      'pyannote/speaker-diarization-community-1': '/models/pyannote',
    },
    alignerModel: undefined,
    release,
  });
  jest.mocked(getUVRuntime).mockResolvedValue({
    installed: true,
    status: 'installed',
    dir: '/runtime/uv',
  } as any);
});

it('sums same-speaker overlap and leaves unmatched speech unknown', () => {
  const turns = [
    { start: 0, end: 0.4, speaker: 'SPEAKER_00' },
    { start: 0.4, end: 0.9, speaker: 'SPEAKER_01' },
    { start: 0.9, end: 1.3, speaker: 'SPEAKER_00' },
  ];
  expect(speakerForSegment(0, 1.3, turns)).toBe('SPEAKER_00');
  expect(speakerForSegment(0.5, 0.8, turns)).toBe('SPEAKER_01');
  expect(speakerForSegment(3, 4, turns)).toBe('UNKNOWN');
});

it('releases the lease if the runtime is missing', async () => {
  jest.mocked(getUVRuntime).mockResolvedValueOnce({ installed: false } as any);
  await expect(acquireSpeakerDiarization()).rejects.toThrow('UV runtime');
  expect(release).toHaveBeenCalledTimes(1);
  expect(runCommand).not.toHaveBeenCalled();
});

it('runs isolated with offline weights, reads validated turns and cleans up', async () => {
  const turns = [{ start: 0, end: 1, speaker: 'SPEAKER_00' }];
  let directory: string;
  jest.mocked(runCommand).mockImplementationOnce(async (command, options) => {
    directory = options.cwd;
    expect(command).toContain("'--no-project' '--no-config'");
    expect(command).toContain("'--model' '/models/pyannote'");
    expect(options.env).toMatchObject({
      HF_HUB_OFFLINE: '1',
      PYANNOTE_METRICS_ENABLED: '0',
    });
    await fs.writeFile(`${directory}/turns.json`, JSON.stringify(turns));
    return { code: 0 } as any;
  });
  const session = await acquireSpeakerDiarization();
  expect(await session.run('/audio/a.wav')).toEqual(turns);
  await expect(fs.stat(directory)).rejects.toThrow();
  session.release();
  expect(release).toHaveBeenCalledTimes(1);
});

it('does not start a worker when already cancelled', async () => {
  const session = await acquireSpeakerDiarization();
  const controller = new AbortController();
  controller.abort();
  await expect(
    session.run('/audio/a.wav', controller.signal),
  ).rejects.toThrow();
  expect(runCommand).not.toHaveBeenCalled();
  session.release();
});
