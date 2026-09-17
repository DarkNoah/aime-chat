/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import { spawn } from 'child_process';
import { getAssetPath } from '..';
import { getQwenAudioRuntime, getUVRuntime } from '@/main/app/runtime';
import { localModelManager } from '@/main/local-model';
import { runCommand } from '../shell';
import { destroyQwenAsrService, getQwenAsrPythonService } from './audio-loader';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('..', () => ({ getAssetPath: jest.fn() }));
jest.mock('@/main/app/runtime', () => ({
  getQwenAudioRuntime: jest.fn(),
  getUVRuntime: jest.fn(),
}));
jest.mock('@/main/app', () => ({ appManager: {} }));
jest.mock('../shell', () => ({ runCommand: jest.fn() }));
jest.mock('@/main/local-model', () => ({
  localModelManager: {
    acquireAudioModel: jest.fn(),
    setAudioModelReleaseHandler: jest.fn(),
  },
}));

describe('managed audio runtime requests', () => {
  let directory: string;
  let requests: any[];
  let failRequest: boolean;
  const release = jest.fn();
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const tts = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign';
  const asr = 'Qwen/Qwen3-ASR-1.7B';
  const aligner = 'Qwen/Qwen3-ForcedAligner-0.6B';

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'linux' });
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'managed-audio-'));
    const assets = path.join(directory, 'assets');
    await fs.mkdir(assets);
    await fs.writeFile(path.join(assets, 'main.py'), '# fixture runtime');
    (getAssetPath as jest.Mock).mockReturnValue(assets);
    (getQwenAudioRuntime as jest.Mock).mockResolvedValue({
      status: 'installed',
      dir: path.join(directory, 'runtime'),
    });
    (getUVRuntime as jest.Mock).mockResolvedValue({
      status: 'installed',
      path: '/fixture/uv',
    });
    (localModelManager.acquireAudioModel as jest.Mock).mockImplementation(
      async (type, id) => ({
        modelPaths: {
          [id]: path.join(directory, type, id),
          ...(type === 'stt'
            ? { [aligner]: path.join(directory, type, aligner) }
            : {}),
        },
        alignerModel: type === 'stt' ? aligner : undefined,
        release,
      }),
    );
    requests = [];
    failRequest = false;
    (spawn as jest.Mock).mockImplementation(() => {
      const child = new EventEmitter() as any;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({
        write(chunk, _encoding, callback) {
          const request = JSON.parse(chunk.toString());
          requests.push(request);
          child.stdout.write(
            `${JSON.stringify({
              id: request.id,
              ok: !failRequest,
              error: failRequest ? 'inference failed' : undefined,
              result: { text: '识别结果', sample_rate: 24000, duration: 1 },
            })}\n`,
          );
          callback();
        },
      });
      child.kill = jest.fn(() => {
        child.emit('exit', 0);
        return true;
      });
      return child;
    });
  });

  afterEach(async () => {
    await destroyQwenAsrService();
    Object.defineProperty(process, 'platform', platform);
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('resolves the requested TTS variant and sends local paths with offline loading', async () => {
    const service = await getQwenAsrPythonService();
    const result = await service.synthesize({
      model: 'Qwen/Qwen3-TTS-1.7B',
      text: '你好',
      instruct: '温柔',
      outputPath: path.join(directory, 'result.wav'),
    });
    expect(localModelManager.acquireAudioModel).toHaveBeenCalledWith(
      'tts',
      tts,
    );
    expect(requests[0]).toMatchObject({
      method: 'tts',
      params: {
        model: tts,
        model_paths: { [tts]: path.join(directory, 'tts', tts) },
      },
    });
    expect(spawn).toHaveBeenCalledWith(
      '/fixture/uv',
      expect.any(Array),
      expect.objectContaining({
        env: expect.objectContaining({
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
        }),
      }),
    );
    expect(runCommand).not.toHaveBeenCalled(); // Linux must not install MLX.
    expect(result.sampleRate).toBe(24000);
    expect(release).toHaveBeenCalledTimes(1);
    expect(localModelManager.setAudioModelReleaseHandler).toHaveBeenCalledWith(
      destroyQwenAsrService,
    );
  });

  it('passes the ASR and aligner directories and removes temporary audio', async () => {
    const service = await getQwenAsrPythonService();
    expect(
      await service.transcribe(Buffer.from('audio'), { model: asr }),
    ).toMatchObject({ text: '识别结果' });
    expect(requests[0]).toMatchObject({
      method: 'predict',
      params: {
        model: asr,
        aligner_model: aligner,
        model_paths: {
          [asr]: path.join(directory, 'stt', asr),
          [aligner]: path.join(directory, 'stt', aligner),
        },
      },
    });
    await expect(fs.stat(requests[0].params.audio_path)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('uses the voice-design variant when the caller leaves the model unspecified', async () => {
    const service = await getQwenAsrPythonService();
    await service.synthesize({
      text: '你好',
      instruct: '温柔',
      outputPath: '/unused.wav',
    });
    expect(localModelManager.acquireAudioModel).toHaveBeenCalledWith(
      'tts',
      tts,
    );
  });

  it('does not launch inference when the model manager reports missing weights', async () => {
    (localModelManager.acquireAudioModel as jest.Mock).mockRejectedValue(
      new Error('Download in Settings > Local Models'),
    );
    const service = await getQwenAsrPythonService();
    await expect(
      service.synthesize({ text: 'test', outputPath: '/unused.wav' }),
    ).rejects.toThrow('Local Models');
    expect(spawn).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

  it('releases the model after an inference failure and allows runtime shutdown', async () => {
    failRequest = true;
    const service = await getQwenAsrPythonService();
    await expect(
      service.synthesize({ text: 'test', outputPath: '/unused.wav' }),
    ).rejects.toThrow('inference failed');
    expect(release).toHaveBeenCalledTimes(1);
    const child = (spawn as jest.Mock).mock.results[0].value;
    await destroyQwenAsrService();
    expect(child.kill).toHaveBeenCalledTimes(1);
  });
});
