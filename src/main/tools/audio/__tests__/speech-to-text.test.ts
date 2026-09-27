/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { downloadFile, saveFile } from '@/main/utils/file';
import { MiniMaxTranscriptionModel } from '@/main/providers/minimax-transcription-model';
import { AlibabaTranscriptionModel } from '@/main/providers/alibaba-transcription-model';
import {
  AudioToolkit,
  SpeechToText,
  MusicGeneration,
  buildSentenceSegments,
} from '../index';
import { acquireSpeakerDiarization } from '@/main/utils/speaker-diarization';

jest.mock('@/main/utils/speaker-diarization', () => ({
  acquireSpeakerDiarization: jest.fn(),
  speakerForSegment: (start: number) =>
    start < 1 ? 'SPEAKER_00' : 'SPEAKER_01',
}));

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

describe('subtitle continuation boundaries', () => {
  // These are synthetic alignments for the supplied transcript, not inferred
  // timings from the user's audio. Keep clauses > 0.8 s to cover the old bug.
  const align = (texts: string[], gap = 0.15) =>
    texts.map((text, index) => ({
      text,
      startSecond: index * (1.2 + gap),
      endSecond: index * (1.2 + gap) + 1.2,
      speaker: 'SPEAKER_00',
    }));

  it.each([
    ['我想要一杯珍珠奶茶，正常微冰', ['我想要一杯珍珠奶茶', '正常微冰']],
    [
      '有珍珠、有奶茶，就把它加在一起就好了',
      ['有珍珠', '有奶茶', '就把它加在一起就好了'],
    ],
    [
      '总之，你刚刚讲的那一杯里面就是有珍珠、有奶茶，',
      ['总之', '你刚刚讲的那一杯里面就是有珍珠', '有奶茶'],
    ],
    ['好的，没有问题，请问甜度冰块，', ['好的', '没有问题', '请问甜度冰块']],
    [
      '那如果我给你点半糖的话，会是你们店的正常，还是你们店的半糖？',
      ['那如果我给你点半糖的话', '会是你们店的正常', '还是你们店的半糖'],
    ],
    ['Yes, I would like tea, please.', ['Yes', 'I would like tea', 'please']],
  ])('joins continuing clauses: %s', (text, tokens) => {
    const aligned = align(tokens as string[]);
    expect(buildSentenceSegments(text as string, aligned)).toEqual([
      {
        startSecond: aligned[0].startSecond,
        endSecond: aligned[aligned.length - 1].endSecond,
        text: (text as string).replace(/[.,，？]+$/, ''),
        speaker: 'SPEAKER_00',
      },
    ]);
  });

  it.each(['。', '？', '！', '.', '?', '!'])(
    'keeps short sentences separate at %s',
    (punctuation) => {
      const aligned = align(['好', '谢谢']).map((segment, index) => ({
        ...segment,
        startSecond: index * 0.3,
        endSecond: index * 0.3 + 0.2,
      }));
      expect(
        buildSentenceSegments(`好${punctuation}谢谢`, aligned).map(
          (segment) => segment.text,
        ),
      ).toEqual(['好', '谢谢']);
    },
  );

  it('never joins across a speaker change even after a comma', () => {
    const aligned = align(['那麻烦给我那一杯', '一杯什么']);
    aligned[1].speaker = 'SPEAKER_01';
    expect(
      buildSentenceSegments('那麻烦给我那一杯，一杯什么？', aligned).map(
        ({ text, speaker }) => ({ text, speaker }),
      ),
    ).toEqual([
      { text: '那麻烦给我那一杯', speaker: 'SPEAKER_00' },
      { text: '一杯什么', speaker: 'SPEAKER_01' },
    ]);
  });

  it('keeps long pauses separate even when punctuation suggests continuation', () => {
    expect(
      buildSentenceSegments('好的，请稍等', align(['好的', '请稍等'], 1.5)).map(
        (segment) => segment.text,
      ),
    ).toEqual(['好的', '请稍等']);
  });

  it('joins a brief pause inside an unfinished phrase', () => {
    expect(
      buildSentenceSegments(
        '麻烦给我一杯QQ奶奶好喝到梅普茶，',
        align(['麻烦给我一杯QQ奶奶好喝到', '梅普茶'], 0.6),
      ),
    ).toHaveLength(1);
  });

  it('keeps natural comma boundaries when merging would exceed the width budget', () => {
    const clauses = [
      '这是长度已经接近字幕上限的第一个分句',
      '这是接在后面的另外一个很长的分句',
    ];
    const segments = buildSentenceSegments(clauses.join('，'), align(clauses));
    expect(segments.map((segment) => segment.text)).toEqual([
      clauses[0],
      clauses[1],
    ]);
  });

  it('does not merge clauses into a subtitle longer than eight seconds', () => {
    const aligned = align(['有珍珠', '有奶茶']);
    aligned[0].endSecond = 4;
    aligned[1].startSecond = 4.2;
    aligned[1].endSecond = 8.2;
    expect(buildSentenceSegments('有珍珠、有奶茶', aligned)).toHaveLength(2);
  });

  it('repeatedly splits long unpunctuated input without losing text or timing coverage', () => {
    const text = '这是一段需要根据字幕长度进行分段的连续讲话'.repeat(6);
    const aligned = Array.from(text, (char, index) => ({
      text: char,
      startSecond: index * 0.3,
      endSecond: (index + 1) * 0.3,
    }));
    const segments = buildSentenceSegments(text, aligned);
    expect(segments.length).toBeGreaterThan(2);
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    for (const segment of segments) {
      expect(segment.text.length).toBeLessThanOrEqual(30);
      expect(segment.endSecond - segment.startSecond).toBeLessThanOrEqual(8);
    }
    expect(segments[0].startSecond).toBe(0);
    expect(segments[segments.length - 1].endSecond).toBe(
      aligned[aligned.length - 1].endSecond,
    );
  });

  it('preserves an indivisible ASR token instead of fabricating word timestamps', () => {
    const aligned = [{ text: '长'.repeat(70), startSecond: 0, endSecond: 12 }];
    expect(buildSentenceSegments(aligned[0].text, aligned)).toEqual(aligned);
  });

  it.each([
    '？', '！', '，', '。', '、', '；', '：', '?', '!', ',', '.', ';', ':',
    '……', '——', '”）】》', '\")]}', '~@#$%^&*+=/\\|<>', '！？?!，,   ',
    '★♥♪', '😊', '❤️',
  ])('strips all trailing symbols %s while preserving internal punctuation', (suffix) => {
    const text = `你好，hello! 好的${suffix}`;
    expect(buildSentenceSegments(text, align([text]))).toEqual([{
      startSecond: 0, endSecond: 1.2, speaker: 'SPEAKER_00',
      text: '你好，hello! 好的',
    }]);
  });

  it('does not emit empty cues from symbol-only input', () => {
    expect(buildSentenceSegments('？！', align(['？！']))).toEqual([]);
  });
});

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
      const file = path.resolve(workspace, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
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
    expect(result).toBe('<system-reminder>\nThis audio file duration is 2.00s.\n</system-reminder>\n<transcription-text>\nHello world\n</transcription-text>');
    expect(providersManager.getProvider).toHaveBeenCalledWith('minimax');
    expect(transcriptionModel).toHaveBeenCalledWith('asr-1.0');
    expect(acquireSpeakerDiarization).not.toHaveBeenCalled();
    const file = fetchMock.mock.calls[0][1].body.get('file');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe(
      'audio-bytes',
    );
  });

  it('rejects a missing diarization model before ASR or downloading URL input', async () => {
    jest
      .mocked(acquireSpeakerDiarization)
      .mockRejectedValueOnce(
        new Error('Download Pyannote in Settings > Local Models'),
      );
    await expect(
      new SpeechToText().execute(
        { source: 'https://example.com/audio.wav', diarize: true },
        context,
      ),
    ).rejects.toThrow('Settings > Local Models');
    expect(transcriptionModel).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'returns structured JSON with diarize=%s and preserves the model output',
    async (diarize) => {
      const release = jest.fn();
      jest
        .mocked(acquireSpeakerDiarization)
        .mockResolvedValue({ run: jest.fn().mockResolvedValue([]), release });
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text: 'Hi. Yes.',
          language: 'en',
          durationInSeconds: 2,
          segments: [
            { text: 'Hi', startSecond: 0, endSecond: 0.8 },
            { text: 'Yes', startSecond: 1, endSecond: 2 },
          ],
        }),
      });
      const tool = new SpeechToText();
      const result = await tool.execute(
        { source: 'input.wav', output_type: 'json', diarize },
        context,
      );
      const expected = {
        duration: 2,
        diarize,
        segments: [
          {
            start: 0,
            end: 0.8,
            text: 'Hi',
            ...(diarize ? { speaker: 'SPEAKER_00' } : {}),
          },
          {
            start: 1,
            end: 2,
            text: 'Yes',
            ...(diarize ? { speaker: 'SPEAKER_01' } : {}),
          },
        ],
      };
      expect(result).toEqual(expected);
      expect(tool.toModelOutput(result)).toEqual({
        type: 'json',
        value: expected,
      });
      expect(
        JSON.parse(JSON.stringify(tool.toModelOutput(result))).value,
      ).toEqual(expected);
      expect(saveFile).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(diarize ? 1 : 0);
    },
  );

  it('keeps long JSON complete without truncating text or timed segments', async () => {
    const segments = Array.from({ length: 1100 }, (_, index) => ({
      text: `Line ${index}.`,
      startSecond: index,
      endSecond: index + 1,
    }));
    const text = segments.map((segment) => segment.text).join('\n');
    transcriptionModel.mockReturnValue({
      doGenerate: jest.fn().mockResolvedValue({ text, segments }),
    });
    const tool = new SpeechToText();
    const result = await tool.execute(
      { source: 'input.wav', output_type: 'json' },
      context,
    );
    expect(result).toEqual({
      duration: null,
      diarize: false,
      segments: segments.map(
        ({ startSecond, endSecond, text: segmentText }) => ({
          start: startSecond,
          end: endSecond,
          text: segmentText.replace(/\.$/, ''),
        }),
      ),
    });
    expect(tool.toModelOutput(result)).toEqual({ type: 'json', value: result });
    expect(JSON.stringify(result)).not.toContain('[truncated]');
  });

  it('returns empty JSON segments when non-diarized ASR has no timestamps', async () => {
    transcriptionModel.mockReturnValue({
      doGenerate: jest.fn().mockResolvedValue({ text: 'Hello' }),
    });
    expect(
      await new SpeechToText().execute(
        { source: 'input.wav', output_type: 'json' },
        context,
      ),
    ).toEqual({
      duration: null,
      diarize: false,
      segments: [],
    });
  });

  it.each([false, true])('uses identical subtitle boundaries in all four formats (diarize=%s)', async (diarize) => {
    jest.mocked(acquireSpeakerDiarization).mockResolvedValue({ run: jest.fn().mockResolvedValue([]), release: jest.fn() });
    transcriptionModel.mockReturnValue({ doGenerate: jest.fn().mockResolvedValue({
      text: 'Hello there. Good morning.', durationInSeconds: 2.2,
      segments: [
        { text: 'Hello', startSecond: 0, endSecond: 0.4 },
        { text: 'there', startSecond: 0.4, endSecond: 0.8 },
        { text: 'Good', startSecond: 1.2, endSecond: 1.6 },
        { text: 'morning', startSecond: 1.6, endSecond: 2.2 },
      ],
    }) });
    const tool = new SpeechToText();
    const json = await tool.execute({ source: 'input.wav', output_type: 'json', diarize }, context);
    expect(json).toEqual({ diarize, duration: 2.2, segments: [
      { start: 0, end: 0.8, text: 'Hello there', ...(diarize ? { speaker: 'SPEAKER_00' } : {}) },
      { start: 1.2, end: 2.2, text: 'Good morning', ...(diarize ? { speaker: 'SPEAKER_01' } : {}) },
    ] });
    const lines = [diarize ? '[SPEAKER_00] Hello there' : 'Hello there', diarize ? '[SPEAKER_01] Good morning' : 'Good morning'];
    const text = await tool.execute({ source: 'input.wav', output_type: 'text', diarize, save_path: 'same.txt' }, context);
    expect(typeof text).toBe('string');
    expect(text).toContain(`<transcription-text>\n${lines.join('\n')}\n</transcription-text>`);
    expect(await fs.readFile(path.join(workspace, 'same.txt'), 'utf8')).toBe(lines.join('\n'));
    await tool.execute({ source: 'input.wav', output_type: 'srt', diarize, save_path: 'same.srt' }, context);
    expect(await fs.readFile(path.join(workspace, 'same.srt'), 'utf8')).toBe(`1\n00:00:00,000 --> 00:00:00,800\n${lines[0]}\n\n2\n00:00:01,200 --> 00:00:02,200\n${lines[1]}\n`);
    await tool.execute({ source: 'input.wav', output_type: 'ass', diarize, save_path: 'same.ass' }, context);
    const ass = await fs.readFile(path.join(workspace, 'same.ass'), 'utf8');
    expect(ass.split('\n').filter((line) => line.startsWith('Dialogue:'))).toEqual([
      `Dialogue: 0,0:00:00.00,0:00:00.80,Default,${diarize ? 'SPEAKER_00' : ''},0,0,0,,Hello there`,
      `Dialogue: 0,0:00:01.20,0:00:02.20,Default,${diarize ? 'SPEAKER_01' : ''},0,0,0,,Good morning`,
    ]);
  });

  it.each(['text', 'srt', 'ass', 'json'] as const)(
    'joins comma continuations in %s tool output',
    async (outputType) => {
      jest.mocked(acquireSpeakerDiarization).mockResolvedValueOnce({
        run: jest.fn().mockResolvedValue([]),
        release: jest.fn(),
      });
      const text = '我想要一杯珍珠奶茶，正常微冰';
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text,
          durationInSeconds: 5,
          segments: [
            { text: '我想要一杯珍珠奶茶', startSecond: 2, endSecond: 3.5 },
            { text: '正常微冰', startSecond: 3.6, endSecond: 4.5 },
          ],
        }),
      });
      const result = await new SpeechToText().execute(
        { source: 'input.wav', diarize: true, output_type: outputType },
        context,
      );
      if (outputType === 'json') {
        expect(result).toEqual({
          diarize: true,
          duration: 5,
          segments: [{ start: 2, end: 4.5, text, speaker: 'SPEAKER_01' }],
        });
      } else if (outputType === 'ass') {
        expect(result).toContain(`Dialogue: 0,0:00:02.00,0:00:04.50,Default,SPEAKER_01,0,0,0,,${text}`);
      } else {
        expect(result).toContain(`[SPEAKER_01] ${text}`);
        if (outputType === 'srt') {
          expect(result).toContain('00:00:02,000 --> 00:00:04,500');
        }
      }
    },
  );

  it('does not restore symbol-only ASR text after cleaning timed segments', async () => {
    transcriptionModel.mockReturnValue({
      doGenerate: jest.fn().mockResolvedValue({
        text: '？！',
        segments: [{ text: '？！', startSecond: 0, endSecond: 1 }],
      }),
    });
    const result = await new SpeechToText().execute(
      { source: 'input.wav', output_type: 'text' },
      context,
    );
    expect(result).not.toContain('？！');
  });

  it.each(['text', 'srt', 'ass', 'json'] as const)(
    'saves complete %s output at the requested path and uses the requested response layout',
    async (outputType) => {
      jest.mocked(acquireSpeakerDiarization).mockResolvedValueOnce({
        run: jest.fn().mockResolvedValue([]),
        release: jest.fn(),
      });
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text: '你好，请问今天想喝点什么呢？一杯咖啡，谢谢。',
          durationInSeconds: 71.981,
          segments: [
            {
              text: '你好，请问今天想喝点什么呢？',
              startSecond: 0.56,
              endSecond: 1.92,
            },
            { text: '一杯咖啡，谢谢', startSecond: 2, endSecond: 3 },
          ],
        }),
      });
      const extension = outputType === 'text' ? 'txt' : outputType;
      const relativePath = `transcripts/result.${extension}`;
      const savedPath = path.join(workspace, relativePath);
      const tool = new SpeechToText();
      const result = await tool.execute(
        {
          source: 'input.wav',
          output_type: outputType,
          diarize: true,
          save_path: relativePath,
        },
        context,
      );
      const saved = await fs.readFile(savedPath, 'utf8');
      if (outputType === 'json') {
        expect(result).toEqual({
          savePath: savedPath,
          diarize: true,
          duration: 71.981,
          segments: [
            {
              start: 0.56,
              end: 1.92,
              text: '你好，请问今天想喝点什么呢',
              speaker: 'SPEAKER_00',
            },
            { start: 2, end: 3, text: '一杯咖啡，谢谢', speaker: 'SPEAKER_01' },
          ],
        });
        expect(JSON.parse(saved)).toEqual(result);
        expect(tool.toModelOutput(result)).toEqual({
          type: 'json',
          value: result,
        });
      } else {
        const modelOutput = tool.toModelOutput(result);
        const rendered =
          typeof modelOutput === 'string' ? modelOutput : modelOutput.value;
        expect(rendered).toBe(
          `<system-reminder>\nThis audio file duration is 71.98s.\nFile saved to: <file>${savedPath}</file>\n</system-reminder>\n<transcription-text>\n${saved}\n</transcription-text>`,
        );
        expect(saved).not.toContain('<system-reminder>');
        expect(saved).not.toContain('<transcription-text>');
        expect(saved).toContain('你好，请问今天想喝点什么呢');
        expect(saved).not.toContain('呢？');
        if (outputType === 'ass') {
          expect(saved).toContain(',Default,SPEAKER_00,0,0,0,,你好');
          expect(saved).not.toContain('[SPEAKER_');
        } else {
          expect(saved).toContain('[SPEAKER_00] 你好');
        }
      }
    },
  );

  it.each([undefined, null, '', '   '])(
    'omits optional save paths for text/JSON when save_path=%s',
    async (savePath) => {
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({ text: 'Hello', segments: [] }),
      });
      for (const outputType of ['text', 'json'] as const) {
        const tool = new SpeechToText();
        const result = await tool.execute(
          { source: 'input.wav', output_type: outputType, save_path: savePath },
          context,
        );
        expect(result).not.toHaveProperty('savePath');
        expect(JSON.stringify(tool.toModelOutput(result))).not.toContain(
          'File saved to:',
        );
      }
      expect(saveFile).not.toHaveBeenCalled();
    },
  );

  it('saves the entire text before truncating its preview and reports an absolute save path', async () => {
    const text = Array.from(
      { length: 1500 },
      (_, index) => `Line ${index}`,
    ).join('\n');
    transcriptionModel.mockReturnValue({
      doGenerate: jest
        .fn()
        .mockResolvedValue({ text, segments: [], durationInSeconds: 0 }),
    });
    const savedPath = path.join(workspace, 'complete.txt');
    const tool = new SpeechToText();
    const result = await tool.execute(
      { source: 'input.wav', save_path: savedPath },
      context,
    );
    expect(await fs.readFile(savedPath, 'utf8')).toBe(text);
    const rendered = tool.toModelOutput(result);
    if (typeof rendered !== 'string') throw new Error('Expected text output');
    expect(rendered).toContain('This audio file duration is 0.00s.');
    expect(rendered).toContain(
      `<file>${savedPath}</file>\n</system-reminder>`,
    );
    expect(rendered.split('\n')).toHaveLength(1000);
  });

  it.each(['text', 'json'] as const)(
    'propagates a %s save failure instead of returning a successful path',
    async (outputType) => {
      jest.mocked(saveFile).mockRejectedValueOnce(new Error('write failed'));
      await expect(
        new SpeechToText().execute(
          {
            source: 'input.wav',
            output_type: outputType,
            save_path: 'output.txt',
          },
          context,
        ),
      ).rejects.toThrow('write failed');
    },
  );

  it.each(['text', 'srt', 'ass'] as const)(
    'preserves speaker changes even in short %s clauses',
    async (outputType) => {
      const run = jest.fn().mockResolvedValue([]);
      const release = jest.fn();
      jest
        .mocked(acquireSpeakerDiarization)
        .mockResolvedValueOnce({ run, release });
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text: 'Hi. Yes.',
          segments: [
            { text: 'Hi', startSecond: 0, endSecond: 0.3 },
            { text: 'Yes', startSecond: 1, endSecond: 1.3 },
          ],
        }),
      });
      const result = await new SpeechToText().execute(
        { source: 'input.wav', diarize: true, output_type: outputType },
        context,
      );
      if (typeof result !== 'string') throw new Error('Expected text output');
      const content = result;
      if (outputType === 'ass') {
        expect(content).toContain(',Default,SPEAKER_00,0,0,0,,Hi');
        expect(content).toContain(',Default,SPEAKER_01,0,0,0,,Yes');
        expect(content).not.toContain('[SPEAKER_');
      } else {
        expect(content).toContain('[SPEAKER_00] Hi');
        expect(content).toContain('[SPEAKER_01] Yes');
      }
      expect(run).toHaveBeenCalledWith(
        path.join(workspace, 'input.wav'),
        context.abortSignal,
      );
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['text', 'json'] as const)(
    'fails explicitly for timestamp-free %s ASR and releases the model',
    async (outputType) => {
      const run = jest.fn();
      const release = jest.fn();
      jest
        .mocked(acquireSpeakerDiarization)
        .mockResolvedValueOnce({ run, release });
      transcriptionModel.mockReturnValue({
        doGenerate: jest
          .fn()
          .mockResolvedValue({ text: 'Hello', segments: [] }),
      });
      await expect(
        new SpeechToText().execute(
          { source: 'input.wav', diarize: true, output_type: outputType },
          context,
        ),
      ).rejects.toThrow('requires transcription timestamps');
      expect(run).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it('downloads URLs for local diarization and cleans up when pyannote fails', async () => {
    const run = jest.fn().mockRejectedValue(new Error('pyannote failed'));
    const release = jest.fn();
    jest
      .mocked(acquireSpeakerDiarization)
      .mockResolvedValueOnce({ run, release });
    const downloaded = path.join(workspace, 'downloaded.wav');
    await fs.writeFile(downloaded, 'audio');
    jest.mocked(downloadFile).mockResolvedValueOnce(downloaded);
    const doGenerateFromUrl = jest.fn();
    transcriptionModel.mockReturnValue({
      doGenerateFromUrl,
      doGenerate: jest.fn().mockResolvedValue({
        text: 'Hello',
        segments: [{ text: 'Hello', startSecond: 0, endSecond: 1 }],
      }),
    });
    await expect(
      new SpeechToText().execute(
        { source: 'https://example.com/audio.wav', diarize: true },
        context,
      ),
    ).rejects.toThrow('pyannote failed');
    expect(doGenerateFromUrl).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(downloaded, context.abortSignal);
    expect(release).toHaveBeenCalledTimes(1);
    await expect(fs.stat(downloaded)).rejects.toThrow();
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

  it.each([997, 1000, 1001, 3000])(
    'limits a %i-line transcription and its formatted model output to 1000 lines',
    async (lineCount) => {
      const lines = Array.from(
        { length: lineCount },
        (_, index) => `Transcript line ${index + 1}`,
      );
      const text = lines.join('\n');
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text,
          segments: [],
          durationInSeconds: 42,
        }),
      });

      const tool = new SpeechToText();
      const result = await tool.execute({ source: 'input.wav' } as any, context);
      expect(typeof result).toBe('string');
      if (typeof result !== 'string') throw new Error('Expected text output');
      const modelOutput = tool.toModelOutput(result);
      expect(modelOutput).toBe(result);
      if (typeof modelOutput !== 'string') throw new Error('Expected text output');
      const fullOutput = `<system-reminder>\nThis audio file duration is 42.00s.\n</system-reminder>\n<transcription-text>\n${text}\n</transcription-text>`;
      expect(modelOutput.split('\n')).toHaveLength(
        Math.min(lineCount + 5, 1000),
      );
      expect(modelOutput).toContain('duration is 42.00s');
      expect(modelOutput).toContain(`<transcription-text>\n${lines[0]}`);
      expect(modelOutput).toContain(`${lines[lineCount - 1]}\n</transcription-text>`);
      if (lineCount + 5 <= 1000) expect(modelOutput).toBe(fullOutput);
      else expect(modelOutput).toContain('...[truncated]...');
    },
  );

  it.each(['srt', 'ass'] as const)(
    'limits the %s preview while saving every subtitle to disk',
    async (outputType) => {
      const segments = Array.from({ length: 1100 }, (_, index) => ({
        text: `Subtitle segment number ${String(index + 1).padStart(4, '0')}.`,
        startSecond: index * 3,
        endSecond: index * 3 + 2,
      }));
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text: segments.map((segment) => segment.text).join('\n'),
          segments,
          durationInSeconds: 3300,
        }),
      });

      const tool = new SpeechToText();
      const result = await tool.execute(
        { source: 'input.wav', output_type: outputType },
        context,
      );
      if (typeof result !== 'string') throw new Error('Expected subtitle output');
      const saved = await fs.readFile(
        path.join(workspace, `subtitle-id.${outputType}`),
        'utf8',
      );
      expect(saved.split('\n').length).toBeGreaterThan(1000);
      expect(saved).not.toContain('...[truncated]...');
      for (const segment of segments) {
        expect(saved).toContain(segment.text.replace(/\.$/, ''));
      }
      expect(result.split('\n')).toHaveLength(1000);
      expect(result).toContain('...[truncated]...');
      expect(result).toContain('Subtitle segment number 0001');
      expect(result).toContain('Subtitle segment number 1100');
      expect(result).not.toContain('Subtitle segment number 0550');
      expect(result).toContain(`<file>${workspace}/subtitle-id.${outputType}</file>`);
      expect(result.endsWith('</transcription-text>')).toBe(true);
      expect(tool.toModelOutput(result)).toBe(result);
    },
  );

  it.each(['srt', 'ass'] as const)(
    'limits the %s fallback when timestamps are missing',
    async (outputType) => {
      transcriptionModel.mockReturnValue({
        doGenerate: jest.fn().mockResolvedValue({
          text: Array.from({ length: 1500 }, (_, index) => `Line ${index + 1}`).join('\n'),
          segments: [],
        }),
      });

      const result = await new SpeechToText().execute(
        { source: 'input.wav', output_type: outputType },
        context,
      );
      if (typeof result !== 'string') throw new Error('Expected fallback output');
      expect(result.split('\n')).toHaveLength(1000);
      expect(result).toContain('No timed segments');
      expect(result).toContain('...[truncated]...');
      expect(result.endsWith('Line 1500')).toBe(true);
      expect(saveFile).not.toHaveBeenCalled();
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
