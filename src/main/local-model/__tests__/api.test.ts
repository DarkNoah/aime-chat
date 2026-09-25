/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'shell-quote';
import type { Application, RequestHandler } from 'express';
import { BaseManager } from '../../BaseManager';
import { appManager } from '../../app';
import { getUVRuntime } from '../../app/runtime';
import { runCommand } from '../../utils/shell';
import { localModelManager } from '..';
import { DefaultModelSettings } from '../../app/default-models';
import type { AppInfo } from '@/types/app';
import type { LocalModelItem } from '@/types/local-model';
import { getAudioModelCatalog, resolveSpeechModelId } from '../audio-models';
import {
  buildModelDownloadCommand,
  DOWNLOAD_MARKER,
  isModelFullyDownloaded,
  getLocalModelPath,
} from '../model-files';

jest.mock('electron', () => ({}));
jest.mock('../../app', () => ({
  appManager: { getInfo: jest.fn(), setDefaultModels: jest.fn() },
}));
jest.mock('../../app/runtime', () => ({ getUVRuntime: jest.fn() }));
jest.mock('../../utils/shell', () => ({ runCommand: jest.fn() }));
jest.mock('@huggingface/transformers', () => ({}));

const routes = new Map<string, RequestHandler>();
const app = Object.fromEntries(
  ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
    method,
    (url: string, handler: RequestHandler) =>
      routes.set(`${method} ${url}`, handler),
  ]),
) as unknown as Application;

async function invoke(method: string, route: string, input: object = {}) {
  const handler = routes.get(`${method} /api/local-models/${route}`);
  if (!handler) throw new Error(`Missing route: ${route}`);
  const res = { headersSent: false, json: jest.fn() };
  const next = jest.fn();
  await handler({ query: {}, ...input } as any, res as any, next);
  return { data: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

let savedDefaults: Partial<AppInfo['defaultModel']>;
let root: string;
let modelPath: string;
const download = {
  type: 'embedding',
  modelId: 'bge-m3',
  source: 'huggingface',
};
const result = (code = 0): Awaited<ReturnType<typeof runCommand>> => ({
  code,
  stdout: '',
  stderr: code ? 'download failed' : '',
  output: '',
  error: undefined,
  processSignal: undefined,
  timedOut: false,
  tempFilePath: undefined,
  pid: 1,
});
function createModel(directory: string) {
  fs.mkdirSync(path.join(directory, 'onnx'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'config.json'), '{}');
  fs.writeFileSync(
    path.join(directory, 'onnx', 'model_quantized.onnx'),
    'test weights',
  );
}

function createAudioModel(directory: string, model: LocalModelItem) {
  for (const file of [...(model.requiredFiles || []), 'model.safetensors']) {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.endsWith('.json') ? '{}' : 'fixture weights');
  }
}

it('keeps undownloaded audio out of selectors and never downloads during acquisition', async () => {
  const model = getAudioModelCatalog('tts')[0];
  expect(await localModelManager.getAvailableAudioModels('tts')).toEqual([]);
  await expect(
    localModelManager.acquireAudioModel('tts', model.id),
  ).rejects.toThrow('Settings > Local Models');
  expect(runCommand).not.toHaveBeenCalled();
});

it.each(['huggingface', 'modelscope'])(
  'downloads ASR and its aligner from %s and tracks dependency deletion',
  async (source) => {
    const catalog = getAudioModelCatalog('stt');
    const model = catalog[0];
    const aligner = catalog.find((item) => item.id === model.dependencies[0]);
    jest.mocked(runCommand).mockImplementation(async (command) => {
      const selected = catalog.find((item) =>
        String(command).includes(item.repo),
      );
      createAudioModel(getLocalModelPath(root, 'stt', selected.id), selected);
      return result();
    });
    const downloaded = await localModelManager.downloadModel({
      type: 'stt',
      modelId: model.id,
      source,
    });
    expect(downloaded.isDownloaded).toBe(true);
    expect(runCommand).toHaveBeenCalledTimes(2);
    for (const [command] of jest.mocked(runCommand).mock.calls) {
      expect(command).toContain(
        source === 'modelscope' ? "'modelscope'" : "'hf'",
      );
    }
    expect(await localModelManager.getAvailableAudioModels('stt')).toEqual([
      { id: model.id, name: model.name },
    ]);
    const lease = await localModelManager.acquireAudioModel('stt', model.id);
    expect(lease.modelPaths[model.id]).toBe(
      getLocalModelPath(root, 'stt', model.id),
    );
    expect(lease.modelPaths[aligner.id]).toBe(
      getLocalModelPath(root, 'stt', aligner.id),
    );
    expect(lease.alignerModel).toBe(aligner.id);
    await expect(
      localModelManager.deleteModel(aligner.id, 'stt'),
    ).rejects.toMatchObject({ status: 409 });
    lease.release();
    lease.release();
    const releaseRuntime = jest.fn().mockResolvedValue(undefined);
    localModelManager.setAudioModelReleaseHandler(releaseRuntime);
    await localModelManager.deleteModel(aligner.id, 'stt');
    expect(releaseRuntime).toHaveBeenCalledTimes(1);
    expect(await localModelManager.getAvailableAudioModels('stt')).toEqual([]);
    expect(fs.existsSync(downloaded.modelPath)).toBe(true);
  },
);

it('downloads Breeze from ModelScope into its managed model directory', async () => {
  const model = getAudioModelCatalog('tts').find((item) =>
    item.id.includes('Breeze'),
  );
  const directory = getLocalModelPath(root, 'tts', model.id);
  jest.mocked(runCommand).mockImplementationOnce(async () => {
    createAudioModel(directory, model);
    return result();
  });
  const downloaded = await localModelManager.downloadModel({
    type: 'tts',
    modelId: model.id,
    source: 'modelscope',
  });
  expect(downloaded).toMatchObject({
    isDownloaded: true,
    modelPath: directory,
  });
  const command = jest.mocked(runCommand).mock.calls[0][0];
  expect(command).toContain("'modelscope' 'download' '--model'");
  expect(command).toContain(model.id);
  expect(command).toContain(directory);
});

it('checks bundled codecs and every weight shard before making TTS selectable', async () => {
  const model = getAudioModelCatalog('tts').find((item) =>
    item.id.includes('Breeze'),
  );
  const directory = getLocalModelPath(root, 'tts', model.id);
  createAudioModel(directory, model);
  expect(isModelFullyDownloaded(directory, model)).toBe(true);
  fs.rmSync(path.join(directory, 'audio_tokenizer/model.safetensors'));
  expect(isModelFullyDownloaded(directory, model)).toBe(false);
  createAudioModel(directory, model);
  fs.writeFileSync(
    path.join(directory, 'model.safetensors.index.json'),
    JSON.stringify({
      weight_map: { a: 'part-1.safetensors', b: 'part-2.safetensors' },
    }),
  );
  fs.writeFileSync(path.join(directory, 'part-1.safetensors'), 'weights');
  expect(await localModelManager.getAvailableAudioModels('tts')).toEqual([]);
  fs.writeFileSync(path.join(directory, 'part-2.safetensors'), 'weights');
  expect(await localModelManager.getAvailableAudioModels('tts')).toEqual([
    { id: model.id, name: model.name },
  ]);
});

it('retains Qwen family IDs while requiring the correct downloaded variant', async () => {
  const model = getAudioModelCatalog('tts').find((item) =>
    item.id.includes('1.7B-VoiceDesign'),
  );
  createAudioModel(getLocalModelPath(root, 'tts', model.id), model);
  expect(await localModelManager.getAvailableAudioModels('tts')).toEqual([
    { id: model.speechModelId, name: 'Qwen3-TTS-1.7B' },
  ]);
  expect(resolveSpeechModelId(model.speechModelId, { instruct: 'warm' })).toBe(
    model.id,
  );
  const voiceId = resolveSpeechModelId(model.speechModelId, {
    voice: 'Vivian',
  });
  await expect(
    localModelManager.acquireAudioModel('tts', voiceId),
  ).rejects.toThrow('not downloaded');
  expect(runCommand).not.toHaveBeenCalled();
});

it.each(['darwin', 'win32', 'linux'])(
  'catalogs only supported audio runtimes on %s',
  (platform) => {
    const models = [
      ...getAudioModelCatalog('tts', platform),
      ...getAudioModelCatalog('stt', platform),
    ];
    expect(
      models.every(
        (model) =>
          model.library === (platform === 'darwin' ? 'mlx' : 'pytorch'),
      ),
    ).toBe(true);
    expect(models.some((model) => model.id.includes('Breeze-TTS-2'))).toBe(
      true,
    );
    expect(models.some((model) => model.id.includes('VoxCPM2'))).toBe(true);
    for (const model of models) {
      expect(model.download.map((source) => source.source).sort()).toEqual([
        'huggingface',
        'modelscope',
      ]);
      const source = model.download.find(
        (item) => item.source === 'modelscope',
      );
      expect(source.repo || model.repo).toBe(
        model.id === 'openbmb/VoxCPM2' ? 'OpenBMB/VoxCPM2' : model.id,
      );
      expect(model.repo.startsWith('mlx-community/')).toBe(
        platform === 'darwin',
      );
    }
    expect(
      models.some(
        (model) =>
          model.selectable === false && model.id.includes('ForcedAligner'),
      ),
    ).toBe(true);
  },
);

beforeAll(() => BaseManager.registerApiRoutes(app));
beforeEach(() => {
  jest.clearAllMocks();
  savedDefaults = { model: 'remote/chat', speechModel: 'remote/speech' };
  const defaults = new DefaultModelSettings({
    read: async () => savedDefaults,
    write: async (value) => {
      savedDefaults = value;
    },
  });
  jest
    .mocked(appManager.setDefaultModels)
    .mockImplementation((patch) => defaults.set(patch));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-local-models-'));
  modelPath = path.join(root, 'embedding', 'bge-m3');
  const uvDir = path.join(root, 'uv');
  fs.mkdirSync(uvDir);
  fs.writeFileSync(
    path.join(uvDir, process.platform === 'win32' ? 'uvx.exe' : 'uvx'),
    'mock',
  );
  jest.mocked(appManager.getInfo).mockResolvedValue({ modelPath: root } as any);
  jest
    .mocked(getUVRuntime)
    .mockResolvedValue({ installed: true, status: 'installed', dir: uvDir });
  jest.mocked(runCommand).mockImplementation(async () => {
    createModel(modelPath);
    return result();
  });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('lists catalog snapshots with provider IDs and verified file status', async () => {
  const initial = await invoke('get', 'list', { query: { type: 'embedding' } });
  expect(initial.error).toBeUndefined();
  expect(Object.keys(initial.data)).toEqual(['embedding']);
  expect(initial.data.embedding[0]).toMatchObject({
    id: 'bge-m3',
    providerModelId: 'local/bge-m3',
    isDownloaded: false,
    status: 'not_downloaded',
    modelPath,
  });
  createModel(modelPath);
  const completed = await invoke('get', 'list', {
    query: { type: 'embedding' },
  });
  expect(completed.data.embedding[0].isDownloaded).toBe(true);
  expect(initial.data.embedding[0].isDownloaded).toBe(false);
  expect(
    completed.data.embedding.find((model) => model.id.startsWith('Qwen/'))
      .providerModelId,
  ).toBe('local/Qwen/Qwen3-Embedding-0.6B');
});

it.each(['../embedding', ['embedding'], 'unknown', '__proto__'])(
  'rejects invalid model type %p',
  async (type) => {
    expect(
      (await invoke('get', 'list', { query: { type } })).error.status,
    ).toBe(400);
  },
);

it.each([
  undefined,
  {},
  { ...download, type: '../outside' },
  { ...download, modelId: '../outside' },
  { ...download, type: 'reranker' },
  { ...download, modelId: 'local/bge-m3' },
  { ...download, source: 'arbitrary; command' },
])(
  'rejects invalid downloads %p before touching disk or running a command',
  async (body) => {
    expect((await invoke('post', 'download', { body })).error.status).toBe(400);
    expect(runCommand).not.toHaveBeenCalled();
    expect(fs.existsSync(modelPath)).toBe(false);
  },
);

it('waits for a download, verifies it and returns a ready model without redownloading', async () => {
  const downloaded = await invoke('post', 'download', { body: download });
  expect(downloaded.error).toBeUndefined();
  expect(downloaded.data).toMatchObject({
    isDownloaded: true,
    status: 'downloaded',
  });
  expect(fs.existsSync(path.join(modelPath, DOWNLOAD_MARKER))).toBe(false);
  const command = jest.mocked(runCommand).mock.calls[0][0] as string;
  if (process.platform !== 'win32') {
    expect(parse(command)).toEqual([
      './uvx',
      'hf',
      'download',
      'Xenova/bge-m3',
      '--local-dir',
      modelPath,
    ]);
  }
  await invoke('post', 'download', { body: download });
  expect(runCommand).toHaveBeenCalledTimes(1);
});

it('requires UV before creating a model directory', async () => {
  jest
    .mocked(getUVRuntime)
    .mockResolvedValue({ installed: false, status: 'not_installed' });
  expect(
    (await invoke('post', 'download', { body: download })).error.status,
  ).toBe(409);
  expect(runCommand).not.toHaveBeenCalled();
  expect(fs.existsSync(modelPath)).toBe(false);
});

it('keeps interrupted files marked incomplete and releases the lock for retry', async () => {
  jest.mocked(runCommand).mockImplementationOnce(async () => {
    createModel(modelPath);
    return result(1);
  });
  expect(
    (await invoke('post', 'download', { body: download })).error.status,
  ).toBe(500);
  expect(isModelFullyDownloaded(modelPath)).toBe(false);
  expect(
    (await invoke('get', 'list', { query: { type: 'embedding' } })).data
      .embedding[0].status,
  ).toBe('incomplete');
  expect(
    (await invoke('post', 'download', { body: download })).data.isDownloaded,
  ).toBe(true);
});

it('does not accept a successful command that only downloaded metadata', async () => {
  jest.mocked(runCommand).mockImplementationOnce(async () => {
    fs.writeFileSync(path.join(modelPath, 'config.json'), '{}');
    return result();
  });
  expect(
    (await invoke('post', 'download', { body: download })).error.status,
  ).toBe(500);
  expect(isModelFullyDownloaded(modelPath)).toBe(false);
});

it('reports in-progress downloads and prevents conflicting delete/download calls', async () => {
  let finish: () => void;
  jest.mocked(runCommand).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => {
          createModel(modelPath);
          resolve(result());
        };
      }),
  );
  const pending = invoke('post', 'download', { body: download });
  await Promise.resolve();
  await Promise.resolve();
  expect(
    (await invoke('post', 'delete', { body: download })).error.status,
  ).toBe(409);
  expect(
    (await invoke('post', 'download', { body: download })).error.status,
  ).toBe(409);
  const status = (await invoke('get', 'list', { query: { type: 'embedding' } }))
    .data.embedding[0];
  expect(status).toMatchObject({ isDownloaded: false, status: 'downloading' });
  finish();
  expect((await pending).data.isDownloaded).toBe(true);
});

it('deletes only a validated model and prevents deleting a loaded model', async () => {
  createModel(modelPath);
  expect(
    (
      await invoke('post', 'delete', {
        body: { modelId: '../outside', type: 'embedding' },
      })
    ).error.status,
  ).toBe(400);
  localModelManager.models['bge-m3'] = {} as any;
  expect(
    (await invoke('post', 'delete', { body: download })).error.status,
  ).toBe(409);
  delete localModelManager.models['bge-m3'];
  const removed = await invoke('post', 'delete', { body: download });
  expect(removed.error).toBeUndefined();
  expect(removed.data).toMatchObject({
    isDownloaded: false,
    status: 'not_downloaded',
  });
  expect(fs.existsSync(path.join(root, 'uv'))).toBe(true);
});

it('detects nested incomplete and zero-byte weights', () => {
  createModel(modelPath);
  const marker = path.join(modelPath, 'onnx', 'weight.incomplete');
  fs.writeFileSync(marker, '');
  expect(isModelFullyDownloaded(modelPath)).toBe(false);
  fs.rmSync(marker);
  fs.writeFileSync(path.join(modelPath, 'onnx', 'model_quantized.onnx'), '');
  expect(isModelFullyDownloaded(modelPath)).toBe(false);
});

it('quotes download paths literally on both supported shells', () => {
  const destination = "/models/user's folder/$(touch nope)`cmd`;test";
  const posix = buildModelDownloadCommand(
    'modelscope',
    'owner/repo',
    destination,
    false,
  );
  expect(parse(posix)).toEqual([
    './uvx',
    '--with',
    'setuptools<81',
    'modelscope',
    'download',
    '--model',
    'owner/repo',
    '--local_dir',
    destination,
  ]);
  const windows = buildModelDownloadCommand(
    'huggingface',
    'owner/repo',
    destination,
    true,
  );
  expect(windows).toContain("'/models/user''s folder/$(touch nope)`cmd`;test'");
  expect(windows).toMatch(/; exit \$LASTEXITCODE$/);
});

it.each([undefined, false])(
  'preserves defaults when setAsDefault is %p',
  async (setAsDefault) => {
    await localModelManager.downloadModel({ ...download, setAsDefault });
    expect(appManager.setDefaultModels).not.toHaveBeenCalled();
  },
);

it.each([null, 'false', 'true', 1, {}])(
  'rejects non-boolean setAsDefault %p before downloading',
  async (setAsDefault) => {
    const res = await invoke('post', 'download', {
      body: { ...download, setAsDefault },
    });
    expect(res.error).toMatchObject({ status: 400 });
    expect(runCommand).not.toHaveBeenCalled();
    expect(appManager.setDefaultModels).not.toHaveBeenCalled();
  },
);

it.each([
  ['embedding', 'bge-m3', 'embeddingModel'],
  ['reranker', 'bge-reranker-base', 'rerankerModel'],
  ['clip', 'clip-vit-base-patch16', 'embeddingModel'],
  ['tts', getAudioModelCatalog('tts')[0].id, 'speechModel'],
  ['stt', getAudioModelCatalog('stt')[0].id, 'transcriptionModel'],
])(
  'sets the %s default to a usable provider ID only after verification',
  async (type, modelId, field) => {
    const list = await localModelManager.getList(type as any);
    const model = list[type].find((item) => item.id === modelId);
    jest.mocked(runCommand).mockImplementation(async (command) => {
      expect(appManager.setDefaultModels).not.toHaveBeenCalled();
      const item = list[type].find((candidate) =>
        String(command).includes(candidate.repo),
      );
      const directory = getLocalModelPath(root, type as any, item.id);
      if (type === 'tts' || type === 'stt') createAudioModel(directory, item);
      else createModel(directory);
      return result();
    });
    const response = await invoke('post', 'download', {
      body: { type, modelId, source: 'modelscope', setAsDefault: true },
    });
    expect(response.error).toBeUndefined();
    expect(response.data.isDownloaded).toBe(true);
    expect(appManager.setDefaultModels).toHaveBeenCalledTimes(1);
    expect(appManager.setDefaultModels).toHaveBeenCalledWith({
      [field]: model.providerModelId,
    });
    expect(savedDefaults.model).toBe('remote/chat');
    expect(savedDefaults[field]).toBe(
      `local/${model.speechModelId || model.id}`,
    );
  },
);

it.each([
  ['other', 'rmbg-1.4'],
  ['ocr', 'ppocrv5-onnx'],
  [
    'stt',
    getAudioModelCatalog('stt').find((model) => model.selectable === false).id,
  ],
])(
  'rejects making non-selectable %s models default without downloading',
  async (type, modelId) => {
    const response = await invoke('post', 'download', {
      body: { type, modelId, source: 'modelscope', setAsDefault: true },
    });
    expect(response.error).toMatchObject({ status: 400 });
    expect(runCommand).not.toHaveBeenCalled();
  },
);

it.each(['download', 'verification'])(
  'does not change defaults after a %s failure',
  async (failure) => {
    jest
      .mocked(runCommand)
      .mockResolvedValueOnce(result(failure === 'download' ? 1 : 0));
    const response = await invoke('post', 'download', {
      body: { ...download, setAsDefault: true },
    });
    expect(response.error).toMatchObject({ status: 500 });
    expect(appManager.setDefaultModels).not.toHaveBeenCalled();
  },
);

it('keeps verified files after a default save failure and retries without downloading again', async () => {
  jest
    .mocked(appManager.setDefaultModels)
    .mockRejectedValueOnce(new Error('disk full'));
  const body = { ...download, setAsDefault: true };
  const failed = await invoke('post', 'download', { body });
  expect(failed.error).toMatchObject({ status: 500 });
  expect(failed.error.message).toContain('Model downloaded');
  expect(
    (await localModelManager.getList('embedding')).embedding[0].isDownloaded,
  ).toBe(true);
  const retried = await invoke('post', 'download', { body });
  expect(retried.error).toBeUndefined();
  expect(runCommand).toHaveBeenCalledTimes(1);
  expect(savedDefaults.embeddingModel).toBe('local/bge-m3');
});

it('preserves both type defaults when selected models finish together', async () => {
  jest.mocked(runCommand).mockImplementation(async (command) => {
    if (String(command).includes('bge-reranker-base'))
      createModel(getLocalModelPath(root, 'reranker', 'bge-reranker-base'));
    else createModel(modelPath);
    return result();
  });
  await Promise.all([
    localModelManager.downloadModel({ ...download, setAsDefault: true }),
    localModelManager.downloadModel({
      ...download,
      type: 'reranker',
      modelId: 'bge-reranker-base',
      setAsDefault: true,
    }),
  ]);
  expect(savedDefaults).toMatchObject({
    model: 'remote/chat',
    embeddingModel: 'local/bge-m3',
    rerankerModel: 'local/bge-reranker-base',
    speechModel: 'remote/speech',
  });
});
