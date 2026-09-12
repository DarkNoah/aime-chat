/** @jest-environment node */
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Providers } from '@/entities/providers';
import { ALIBABA_REGIONS } from '@/types/alibaba';
import { AlibabaProvider } from './alibaba-provider';

// Isolate this adapter from the legacy BaseProvider SDK type mismatch.
jest.mock('./base-provider', () => ({
  BaseProvider: class {
    provider: Providers;

    constructor({ provider }: { provider: Providers }) {
      this.provider = provider;
    }
  },
}));

jest.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: jest.fn(() => ({
    languageModel: jest.fn(() => 'chat-model'),
  })),
}));

describe('AlibabaProvider', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const provider = {
    id: 'p1',
    name: 'My Alibaba',
    type: 'alibaba',
    apiKey: 'test-key',
    apiBase: 'https://chat.example/compatible-mode/v1',
    config: {
      workspaceId: 'workspace',
      region: 'cn-beijing',
    },
  } as Providers;

  it('retains existing chat settings while selecting a separate video endpoint', () => {
    const adapter = new AlibabaProvider(provider);
    expect(adapter.languageModel('qwen-plus')).toBe('chat-model');
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: provider.apiBase,
      apiKey: 'test-key',
      name: 'My Alibaba',
      includeUsage: true,
    });
    expect(adapter.videoModel('wan3.0-video').modelId).toBe('wan3.0-video');
  });

  it.each(['cn-beijing', 'ap-southeast-1', 'us-east-1'])(
    'exposes 3D models only in Beijing (region %s)',
    async (region) => {
      const adapter = new AlibabaProvider({
        ...provider,
        config: { workspaceId: 'workspace', region },
      });
      const models = await adapter.get3DModelList();
      expect(models.map(({ id }) => id)).toEqual(
        region === 'cn-beijing' ? ['Tripo/Tripo-H3.1', 'Tripo/Tripo-P1.0'] : [],
      );
      for (const { id } of models) expect(adapter.model3d(id).modelId).toBe(id);
    },
  );

  it('routes 3D generation to the workspace independently from chat settings', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: { task_id: '3d-task', task_status: 'PENDING' },
        }),
      ),
    );
    const adapter = new AlibabaProvider(provider);
    await adapter.model3d('Tripo/Tripo-P1.0').doGenerate({ prompt: 'Cat' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/3d-generation',
    );
  });

  it.each(['cn-beijing', 'ap-southeast-1', 'us-east-1'])(
    'exposes speech models available in %s',
    async (region) => {
      const adapter = new AlibabaProvider({
        ...provider,
        config: { workspaceId: 'workspace', region },
      });
      const models = await adapter.getSpeechModelList();
      expect(models.length).toBe(
        { 'cn-beijing': 15, 'ap-southeast-1': 4, 'us-east-1': 0 }[region],
      );
      for (const { id } of models)
        expect(adapter.speechModel(id).modelId).toBe(id);
      expect(models.some(({ id }) => id === 'MiniMax/speech-2.8-hd')).toBe(
        region === 'cn-beijing',
      );
    },
  );

  it.each(['alibaba', 'alibaba-cn'])(
    'preserves the chat catalog and adds two video models for %s',
    async (type) => {
      const adapter = new AlibabaProvider({ ...provider, type });
      expect((await adapter.getLanguageModelList()).length).toBeGreaterThan(0);
      expect(await adapter.getVideoModelList()).toEqual([
        { id: 'wan3.0-video', name: 'Wan 3.0 Video' },
        { id: 'wan3.0-video-prime', name: 'Wan 3.0 Video Prime' },
      ]);
    },
  );

  it.each(['cn-beijing', 'ap-southeast-1', 'us-east-1', 'eu-central-1'])(
    'filters transcription models for region %s',
    async (region) => {
      const adapter = new AlibabaProvider({
        ...provider,
        config: { workspaceId: 'workspace', region },
      });
      const ids = (await adapter.getTranscriptionModelList()).map(
        (model) => model.id,
      );
      const expected = {
        'cn-beijing': ['fun-asr', 'qwen3-asr-flash-filetrans', 'paraformer-v2'],
        'ap-southeast-1': ['fun-asr', 'qwen3-asr-flash-filetrans'],
        'us-east-1': ['qwen3-asr-flash-us'],
        'eu-central-1': [],
      }[region];
      expect(ids).toEqual(expect.arrayContaining(expected));
      expect(ids.includes('paraformer-v2')).toBe(region === 'cn-beijing');
      expect(ids.includes('qwen3-asr-flash-us')).toBe(region === 'us-east-1');
      expect(ids.length === 0).toBe(region === 'eu-central-1');
    },
  );

  it('uses workspace settings for transcription independently from the chat API base', async () => {
    const adapter = new AlibabaProvider(provider);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ text: 'Recognized' }] } }],
          },
        }),
      ),
    );
    await expect(
      adapter
        .transcriptionModel('qwen3-asr-flash')
        .doGenerate({ audio: new Uint8Array([1]), mediaType: 'audio/wav' }),
    ).resolves.toMatchObject({ text: 'Recognized' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    );
  });

  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          output: { task_id: 'task-1', task_status: 'PENDING' },
        }),
      ),
    );
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it.each([undefined, '', ...ALIBABA_REGIONS, 'custom-region-1'])(
    'builds the workspace video endpoint for region %s',
    async (region) => {
      const adapter = new AlibabaProvider({
        ...provider,
        config: { workspaceId: ' workspace ', region },
      });
      await adapter.videoModel('wan3.0-video').doGenerate({ prompt: 'Move' });
      expect(fetchMock.mock.calls[0][0]).toBe(
        `https://workspace.${region || 'cn-beijing'}.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`,
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        'Bearer test-key',
      );
    },
  );

  it.each([
    { workspaceId: '' },
    { workspaceId: 'https://example.com' },
    { workspaceId: 'workspace', region: 'region/invalid' },
    { videoApiBase: 'https://workspace.cn-beijing.maas.aliyuncs.com/api/v1' },
  ])('requires valid independent settings: %j', (config) => {
    expect(() =>
      new AlibabaProvider({ ...provider, config }).videoModel('wan3.0-video'),
    ).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
