/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { downloadFile, saveFile } from '@/main/utils/file';
import { MiniMaxTranscriptionModel } from '@/main/providers/minimax-transcription-model';
import { AlibabaTranscriptionModel } from '@/main/providers/alibaba-transcription-model';
import { AudioToolkit, SpeechToText, MusicGeneration } from '../index';

jest.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
jest.mock('@/main/app', () => ({ appManager: { getInfo: jest.fn() } }));
jest.mock('@/main/providers', () => ({
  providersManager: { getProvider: jest.fn() },
}));
jest.mock('@/main/utils/file', () => ({
  saveFile: jest.fn(),
  downloadFile: jest.fn(),
}));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'subtitle-id' }));
jest.mock('@/types/tool', () => ({
  ToolConfig: {
    SpeechToText: { configSchema: {} },
    TextToSpeech: { configSchema: {} },
    MusicGeneration: { configSchema: {} },
    ListVoices: { configSchema: {} },
  },
}));

describe('MiniMax through SpeechToText', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let workspace: string;
  let context: any;
  const transcriptionModel = jest.fn();
  beforeEach(async () => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-asr-'));
    await fs.writeFile(path.join(workspace, 'input.wav'), 'audio-bytes');
    context = {
      requestContext: { get: () => workspace },
      abortSignal: new AbortController().signal,
    };
    (appManager.getInfo as jest.Mock).mockResolvedValue({
      defaultModel: { transcriptionModel: 'minimax/asr-1.0' },
    });
    (providersManager.getProvider as jest.Mock).mockResolvedValue({
      transcriptionModel,
    });
    transcriptionModel.mockReturnValue(
      new MiniMaxTranscriptionModel({
        modelId: 'asr-1.0',
        provider: { apiKey: 'test-key' } as any,
        apiBase: 'https://api.minimaxi.com/v1',
      }),
    );
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'Hello world.',
          duration: 2,
          segments: [
            { text: 'Hello', start: 0.25, end: 0.75 },
            { text: ' world.', start: 0.75, end: 1.5 },
          ],
        }),
      ),
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

  it('uses the default ASR model, workspace paths and default text output', async () => {
    const result = await new SpeechToText().execute(
      { source: 'input.wav' } as any,
      context,
    );
    expect(result).toEqual({ text: 'Hello world.', durationInSeconds: 2 });
    expect(providersManager.getProvider).toHaveBeenCalledWith('minimax');
    expect(transcriptionModel).toHaveBeenCalledWith('asr-1.0');
    const file = fetchMock.mock.calls[0][1].body.get('file');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe(
      'audio-bytes',
    );
  });

  it.each([
    ['srt', '00:00:00,250 --> 00:00:01,500'],
    ['ass', '0:00:00.25,0:00:01.50'],
  ] as const)(
    'saves valid %s subtitles from MiniMax timestamps',
    async (outputType, timestamp) => {
      const result = await new SpeechToText().execute(
        { source: 'input.wav', output_type: outputType },
        context,
      );
      const content = await fs.readFile(
        path.join(workspace, `subtitle-id.${outputType}`),
        'utf8',
      );
      expect(result).toContain(
        `<file>${workspace}/subtitle-id.${outputType}</file>`,
      );
      expect(content).toContain(timestamp);
      // The existing subtitle formatter removes sentence-ending punctuation.
      expect(content).toContain('Hello world');
    },
  );

  it('lets the tool configuration override the default model', async () => {
    await new SpeechToText({ modelId: 'custom/asr-1.0' }).execute(
      { source: 'input.wav', output_type: 'text' },
      context,
    );
    expect(providersManager.getProvider).toHaveBeenCalledWith('custom');
  });

  it('passes cancellation through to the ASR request', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async (_url, request) => {
      controller.abort();
      request.signal.throwIfAborted();
    });
    await expect(
      new SpeechToText().execute(
        { source: 'input.wav', output_type: 'text' },
        { ...context, abortSignal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('passes public URLs directly to Alibaba and saves subtitles in the workspace', async () => {
    transcriptionModel.mockReturnValue(
      new AlibabaTranscriptionModel({
        modelId: 'fun-asr',
        apiKey: 'test-key',
        region: 'cn-beijing',
        apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1',
      }),
    );
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: {
              task_id: 'task-1',
              task_status: 'SUCCEEDED',
              results: [
                {
                  subtask_status: 'SUCCEEDED',
                  transcription_url: 'https://results.example/transcript.json',
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transcripts: [
              {
                text: 'Hello world.',
                sentences: [
                  { text: 'Hello world.', begin_time: 250, end_time: 1500 },
                ],
              },
            ],
          }),
        ),
      );
    const source = 'https://audio.example/download?signature=unchanged';
    await new SpeechToText({ modelId: 'alibaba/fun-asr' }).execute(
      { source, output_type: 'srt' },
      context,
    );
    expect(downloadFile).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input.file_urls).toEqual(
      [source],
    );
    expect(
      await fs.readFile(path.join(workspace, 'subtitle-id.srt'), 'utf8'),
    ).toContain('00:00:00,250 --> 00:00:01,500');
  });

  it('falls back to downloading opaque URLs for providers requiring a known format', async () => {
    const doGenerate = jest
      .fn()
      .mockResolvedValue({ text: 'Recognized', segments: [] });
    const doGenerateFromUrl = jest.fn();
    transcriptionModel.mockReturnValue({
      doGenerate,
      doGenerateFromUrl,
      canGenerateFromUrl: () => false,
    });
    const downloaded = path.join(workspace, 'downloaded.wav');
    await fs.writeFile(downloaded, 'downloaded-audio');
    (downloadFile as jest.Mock).mockResolvedValue(downloaded);
    await new SpeechToText().execute(
      { source: 'https://example.com/download', output_type: 'text' },
      context,
    );
    expect(doGenerateFromUrl).not.toHaveBeenCalled();
    expect(doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ audio: Buffer.from('downloaded-audio') }),
    );
    await expect(fs.stat(downloaded)).rejects.toThrow();
  });

  it('reports missing timestamps for Qwen Flash without fabricating a subtitle file', async () => {
    transcriptionModel.mockReturnValue(
      new AlibabaTranscriptionModel({
        modelId: 'qwen3-asr-flash',
        apiKey: 'test-key',
        region: 'cn-beijing',
        apiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1',
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ text: 'Recognized' }] } }],
          },
        }),
      ),
    );
    const output = await new SpeechToText({
      modelId: 'alibaba/qwen3-asr-flash',
    }).execute({ source: 'input.wav', output_type: 'srt' }, context);
    expect(output).toContain('No timed segments');
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('keeps music generation registered in the audio toolkit', () => {
    const toolkit = new AudioToolkit();
    expect(toolkit.tools.some((tool) => tool instanceof MusicGeneration)).toBe(
      true,
    );
  });
});
