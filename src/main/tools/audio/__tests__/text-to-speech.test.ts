/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { saveFile } from '@/main/utils/file';
import { AlibabaSpeechModel } from '@/main/providers/alibaba-speech-model';
import { TextToSpeech } from '../index';

jest.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
jest.mock('@/main/app', () => ({ appManager: { getInfo: jest.fn() } }));
jest.mock('@/main/providers', () => ({
  providersManager: { getProvider: jest.fn() },
}));
jest.mock('@/main/utils/file', () => ({
  saveFile: jest.fn(),
  downloadFile: jest.fn(),
}));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'speech-id' }));
jest.mock('@/types/tool', () => ({
  ToolConfig: {
    SpeechToText: { configSchema: {} },
    TextToSpeech: { configSchema: {} },
    MusicGeneration: { configSchema: {} },
    ListVoices: { configSchema: {} },
  },
}));

describe('TextToSpeech', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const speechModel = jest.fn();
  let workspace: string;
  let context: any;
  beforeEach(async () => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock;
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-tts-'));
    context = {
      requestContext: { get: () => workspace },
      abortSignal: new AbortController().signal,
    };
    (appManager.getInfo as jest.Mock).mockResolvedValue({
      defaultModel: { speechModel: 'alibaba/MiniMax/speech-2.8-hd' },
    });
    (providersManager.getProvider as jest.Mock).mockResolvedValue({
      speechModel,
    });
    speechModel.mockImplementation(
      (modelId) =>
        new AlibabaSpeechModel({
          modelId,
          apiKey: 'test-key',
          region: 'cn-beijing',
          apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1',
        }),
    );
    (saveFile as jest.Mock).mockImplementation(async (data, name) => {
      const file = path.join(workspace, name);
      await fs.writeFile(file, data);
      return file;
    });
  });
  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses the default model, preserves slash IDs and saves bytes without local metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            base_resp: { status_code: 0 },
            data: { audio: Buffer.from('audio').toString('hex'), status: 2 },
            extra_info: { audio_length: 2500, audio_sample_rate: 24000 },
          },
        }),
      ),
    );
    const result = await new TextToSpeech().execute({ text: '你好' }, context);
    expect(providersManager.getProvider).toHaveBeenCalledWith('alibaba');
    expect(speechModel).toHaveBeenCalledWith('MiniMax/speech-2.8-hd');
    expect(
      JSON.parse(fetchMock.mock.calls[0][1].body).input.audio_setting.format,
    ).toBe('wav');
    expect(
      await fs.readFile(path.join(workspace, 'speech-id.wav'), 'utf8'),
    ).toBe('audio');
    expect(result).toContain('(2.5s, 24000Hz)');
  });

  it('passes WAV and cancellation to a configured override without inventing metadata', async () => {
    const doGenerate = jest.fn().mockResolvedValue({
      audio: Buffer.from('audio'),
      warnings: [],
      response: {},
    });
    speechModel.mockReturnValue({ doGenerate });
    const result = await new TextToSpeech({ modelId: 'other/model' }).execute(
      { text: 'Hello', save_path: 'out.wav' },
      context,
    );
    expect(providersManager.getProvider).toHaveBeenCalledWith('other');
    expect(doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        outputFormat: 'wav',
        abortSignal: context.abortSignal,
      }),
    );
    expect(result).toBe(
      `Generated speech audio saved to: \n<file>${path.join(workspace, 'out.wav')}</file>`,
    );
  });

  it('retains local reference audio and output file handling', async () => {
    const ref = path.join(workspace, 'reference.wav');
    await fs.writeFile(ref, 'reference');
    const generated = path.join(workspace, 'temporary.wav');
    await fs.writeFile(generated, 'generated');
    const doGenerate = jest.fn().mockResolvedValue({
      audio: generated,
      providerMetadata: {
        local: { outputPath: generated, duration: 1, sampleRate: 24000 },
      },
    });
    speechModel.mockReturnValue({ doGenerate });
    await new TextToSpeech({ modelId: 'local/tts' }).execute(
      { text: 'Hello', ref_audio: 'reference.wav', ref_text: 'Reference' },
      context,
    );
    expect(doGenerate.mock.calls[0][0].providerOptions.local.ref_audio).toBe(
      ref,
    );
    await expect(fs.access(generated)).rejects.toThrow();
    expect(
      await fs.readFile(path.join(workspace, 'speech-id.wav'), 'utf8'),
    ).toBe('generated');
  });

  it('does not save after cancellation during synthesis', async () => {
    const controller = new AbortController();
    context.abortSignal = controller.signal;
    speechModel.mockReturnValue({
      doGenerate: async () => {
        controller.abort();
        return { audio: Buffer.from('audio') };
      },
    });
    await expect(
      new TextToSpeech().execute({ text: 'Hello' }, context),
    ).rejects.toThrow();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('does not save empty audio', async () => {
    speechModel.mockReturnValue({
      doGenerate: async () => ({ audio: new Uint8Array() }),
    });
    await expect(
      new TextToSpeech().execute({ text: 'Hello' }, context),
    ).rejects.toThrow('empty audio');
    expect(saveFile).not.toHaveBeenCalled();
  });
});
