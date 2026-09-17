/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getQwenAsrPythonService } from '../utils/loaders/audio-loader';
import { localModelManager } from '../local-model';
import { LocalProvider, LocalSpeechModel } from './local-provider';

jest.mock('./base-provider', () => ({ BaseProvider: class {} }));
jest.mock('../app', () => ({ appManager: {} }));
jest.mock('../local-model', () => ({
  localModelManager: { getAvailableAudioModels: jest.fn() },
}));
jest.mock('@huggingface/transformers', () => ({}));
jest.mock('../utils/loaders/audio-loader', () => ({
  getQwenAsrPythonService: jest.fn(),
}));
jest.mock('../utils/loaders/ocr-loader', () => ({}));
jest.mock('../app/runtime', () => ({}));
jest.mock('../utils/system-ocr', () => ({}));

describe('local Breeze speech models', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    jest.clearAllMocks();
  });

  it('lists only speech models approved by local model management', async () => {
    const models = [
      { id: 'mlx-community/Breeze-TTS-2-mlx-4bit', name: 'Breeze TTS 2' },
    ];
    jest
      .mocked(localModelManager.getAvailableAudioModels)
      .mockResolvedValue(models);
    expect(await new LocalProvider().getSpeechModelList()).toEqual(models);
    expect(localModelManager.getAvailableAudioModels).toHaveBeenCalledWith(
      'tts',
    );
    jest
      .mocked(localModelManager.getAvailableAudioModels)
      .mockResolvedValue([]);
    expect(await new LocalProvider().getTranscriptionModelList()).toEqual([]);
    expect(localModelManager.getAvailableAudioModels).toHaveBeenCalledWith(
      'stt',
    );
  });

  it('passes voice direction to the local service and returns its WAV metadata', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'breeze-provider-'));
    try {
      const outputPath = path.join(tmp, 'speech.wav');
      await fs.writeFile(outputPath, Buffer.from('RIFF-test-audio'));
      const synthesize = jest.fn().mockResolvedValue({
        outputPath,
        sampleRate: 24000,
        duration: 1.5,
      });
      (getQwenAsrPythonService as jest.Mock).mockResolvedValue({ synthesize });
      const result = await new LocalSpeechModel(
        'mlx-community/Breeze-TTS-2-mlx-4bit',
      ).doGenerate({
        text: '[笑] 欢迎回来。',
        instructions: '语气温暖',
        language: 'Chinese',
        providerOptions: {
          local: {
            ref_audio: '/reference.wav',
            ref_text: '参考录音',
            outputPath,
          },
        },
      });
      expect(synthesize).toHaveBeenCalledWith({
        model: 'mlx-community/Breeze-TTS-2-mlx-4bit',
        text: '[笑] 欢迎回来。',
        instruct: '语气温暖',
        language: 'Chinese',
        ref_audio: '/reference.wav',
        ref_text: '参考录音',
        outputPath,
      });
      expect(result.audio).toEqual(Buffer.from('RIFF-test-audio'));
      expect(result.providerMetadata?.local).toEqual({
        outputPath,
        sampleRate: 24000,
        duration: 1.5,
      });
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
