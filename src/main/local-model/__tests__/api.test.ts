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
import {
  buildModelDownloadCommand,
  DOWNLOAD_MARKER,
  isModelFullyDownloaded,
} from '../model-files';

jest.mock('electron', () => ({}));
jest.mock('../../app', () => ({ appManager: { getInfo: jest.fn() } }));
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

beforeAll(() => BaseManager.registerApiRoutes(app));
beforeEach(() => {
  jest.clearAllMocks();
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

it.each(['../embedding', ['embedding'], 'tts', '__proto__'])(
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
