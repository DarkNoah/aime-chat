/** @jest-environment node */
import type { Application, RequestHandler } from 'express';
import fs from 'fs/promises';
import os from 'os';
import pathUtils from 'path';
import { BaseManager } from '@/main/BaseManager';
import { appManager } from '@/main/app';
import mastraManager from '@/main/mastra';
import { agentManager } from '@/main/mastra/agents';
import { evalsManager } from '../index';
import { ScorerRegistry } from '../scorer-registry';

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));
jest.mock('@/entities/eval-scorers', () => ({ EvalScorer: class {} }));
jest.mock('@/main/app', () => ({ appManager: { getInfo: jest.fn() } }));
jest.mock('@/main/db', () => ({
  dbManager: { dataSource: { getRepository: jest.fn() } },
}));
jest.mock('@/main/mastra', () => ({
  __esModule: true,
  default: {
    mastra: {
      datasets: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        compareExperiments: jest.fn(),
      },
      getStorage: jest.fn(),
    },
    getThreadMessages: jest.fn(),
  },
}));
jest.mock('@/main/mastra/agents', () => ({
  agentManager: { getAgent: jest.fn(), buildAgent: jest.fn() },
}));
jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'test-id' }));
jest.mock('@mastra/evals/scorers/utils', () => ({
  getTextContentFromMastraDBMessage: jest.fn(),
}));
jest.mock('@mastra/core/request-context', () => ({ RequestContext: Map }));
jest.mock('../scorer-registry', () => ({
  ScorerRegistry: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    list: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createTemporary: jest.fn(),
    get: jest.fn(),
  })),
}));

const routes = new Map<string, RequestHandler>();
const app = Object.fromEntries(
  ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
    method,
    jest.fn((path: string, handler: RequestHandler) =>
      routes.set(`${method} ${path}`, handler),
    ),
  ]),
) as unknown as Application;

const invoke = async (
  method: string,
  path: string,
  input: { query?: object; body?: unknown } = {},
) => {
  const handler = routes.get(`${method} /api/evals/${path}`);
  if (!handler) throw new Error(`Missing route: ${method} ${path}`);
  const response = { headersSent: false, json: jest.fn() };
  const next = jest.fn();
  await handler({ query: {}, ...input } as any, response as any, next);
  return { data: response.json.mock.calls[0]?.[0], next };
};

const { datasets } = mastraManager.mastra;
const dataset = {
  getDetails: jest.fn(),
  update: jest.fn(),
  listItems: jest.fn(),
  addItems: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  startExperimentAsync: jest.fn(),
  listExperiments: jest.fn(),
  getExperiment: jest.fn(),
  listExperimentResults: jest.fn(),
};
const scoresStore = {
  listScoresByRunId: jest.fn(),
  listScoresByEntityId: jest.fn(),
};
let registry: jest.Mocked<ScorerRegistry>;
let userData: string;

beforeAll(async () => {
  userData = await fs.mkdtemp(pathUtils.join(os.tmpdir(), 'aime-evals-test-'));
  await evalsManager.init();
  registry = jest.mocked(ScorerRegistry).mock.results[0].value;
  BaseManager.registerApiRoutes(app);
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.mocked(appManager.getInfo).mockResolvedValue({ userData } as any);
  jest.mocked(datasets.get).mockResolvedValue(dataset as any);
  jest.mocked(mastraManager.mastra.getStorage).mockReturnValue({
    getStore: async () => scoresStore,
  } as any);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

afterAll(async () => {
  await fs.rm(userData, { recursive: true, force: true });
});

it('returns the dataset default workspace without creating it', async () => {
  dataset.getDetails.mockResolvedValue({ id: 'default-ds', name: 'QA' });
  const { data } = await invoke('get', 'get-dataset', {
    query: { id: 'default-ds' },
  });
  expect(data.defaultWorkspace).toBe(
    pathUtils.join(userData, 'evals', 'default-ds'),
  );
  await expect(fs.stat(data.defaultWorkspace)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it.each([undefined, null, '', '   ', 'relative/path', 123])(
  'rejects invalid workspace %p before starting an experiment',
  async (workspace) => {
    const response = await invoke('post', 'start-experiment', {
      body: { datasetId: 'ds', workspace },
    });
    expect(response.next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(datasets.get).not.toHaveBeenCalled();
    expect(dataset.startExperimentAsync).not.toHaveBeenCalled();
  },
);

it('rejects a workspace that points to a file before starting a run', async () => {
  const workspace = pathUtils.join(userData, 'file.txt');
  await fs.writeFile(workspace, 'preserve');
  const response = await invoke('post', 'start-experiment', {
    body: { datasetId: 'ds', workspace },
  });
  expect(response.next).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'EEXIST' }),
  );
  expect(dataset.startExperimentAsync).not.toHaveBeenCalled();
  expect(await fs.readFile(workspace, 'utf8')).toBe('preserve');
});

it('registers once and keeps the local export-file writer outside HTTP', () => {
  expect(routes.size).toBe(21);
  BaseManager.registerApiRoutes(app);
  expect(app.get).not.toHaveBeenCalled();
  expect(app.post).not.toHaveBeenCalled();
  expect(routes.has('post /api/evals/save-dataset-export')).toBe(false);
});

it('converts query pagination and preserves dataset filters/defaults', async () => {
  jest.mocked(datasets.list).mockResolvedValue({ datasets: [] } as any);
  const response = await invoke('get', 'list-datasets', {
    query: { page: '2', perPage: '5', name: '中文 & QA' },
  });
  expect(response.data).toEqual({ datasets: [] });
  expect(datasets.list).toHaveBeenLastCalledWith({
    page: 2,
    perPage: 5,
    filters: { targetType: 'agent', name: '中文 & QA' },
  });
  await invoke('get', 'list-datasets');
  expect(datasets.list).toHaveBeenLastCalledWith({
    page: 0,
    perPage: 20,
    filters: { targetType: 'agent' },
  });
});

it.each([
  ['list-datasets', { page: '-1' }],
  ['list-datasets', { page: '1.5' }],
  ['list-datasets', { perPage: '0' }],
  ['list-datasets', { page: ['1', '2'] }],
  ['list-datasets', { page: '9007199254740992' }],
  ['get-dataset', {}],
  ['get-dataset', { id: { nested: 'id' } }],
  ['get-experiment', { datasetId: 'ds' }],
  ['export-dataset', { datasetId: 'ds', format: 'xml' }],
])(
  'rejects malformed %s queries before calling storage',
  async (path, query) => {
    const response = await invoke('get', path, { query });
    expect(response.next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
    );
    expect(response.data).toBeUndefined();
    expect(datasets.get).not.toHaveBeenCalled();
    expect(datasets.list).not.toHaveBeenCalled();
  },
);

it('creates a dataset and passes structured samples through the same manager', async () => {
  jest.mocked(datasets.create).mockResolvedValue(dataset as any);
  dataset.getDetails.mockResolvedValue({ id: 'ds', name: 'QA' });
  const created = await invoke('post', 'create-dataset', {
    body: {
      name: ' QA ',
      description: ' regression ',
      scorerIds: ['scorer'],
      targetIds: ['agent'],
    },
  });
  expect(created.data).toEqual({ id: 'ds', name: 'QA' });
  expect(datasets.create).toHaveBeenCalledWith({
    name: 'QA',
    description: 'regression',
    targetType: 'agent',
    scorerIds: ['scorer'],
    targetIds: ['agent'],
  });
  const items = [
    {
      input: { question: '你好' },
      groundTruth: '你好',
      metadata: { kind: 'greeting' },
    },
  ];
  dataset.addItems.mockResolvedValue([{ id: 'item-1', ...items[0] }]);
  const added = await invoke('post', 'add-dataset-items', {
    body: { datasetId: created.data.id, items },
  });
  expect(datasets.get).toHaveBeenCalledWith({ id: 'ds' });
  expect(dataset.addItems).toHaveBeenCalledWith({ items });
  expect(added.data[0].id).toBe('item-1');
});

it('reports partial JSONL imports and returns export content through HTTP', async () => {
  const imported = await invoke('post', 'import-dataset', {
    body: {
      datasetId: 'ds',
      format: 'jsonl',
      content: '{"input":"你好"}\nnot json\n{}',
    },
  });
  expect(imported.data).toMatchObject({ imported: 1, skipped: 2 });
  expect(imported.data.errors).toHaveLength(2);
  dataset.getDetails.mockResolvedValue({ name: '中文测试' });
  dataset.listItems.mockResolvedValue({
    items: [{ input: '你好', groundTruth: '你好' }],
  });
  const exported = await invoke('get', 'export-dataset', {
    query: { datasetId: 'ds', format: 'jsonl' },
  });
  expect(exported.data).toEqual({
    filename: '中文测试.jsonl',
    mimeType: 'application/x-ndjson',
    content: '{"input":"你好","groundTruth":"你好"}',
  });
});

it('maps scalar IDs from query/body and serializes void deletes as null', async () => {
  await invoke('get', 'get-dataset', { query: { id: 'ds' } });
  expect(datasets.get).toHaveBeenCalledWith({ id: 'ds' });
  expect(
    (await invoke('post', 'delete-dataset', { body: { id: 'ds' } })).data,
  ).toBeNull();
  expect(datasets.delete).toHaveBeenCalledWith({ id: 'ds' });
  await invoke('post', 'delete-scorer', { body: { id: 'scorer' } });
  expect(registry.delete).toHaveBeenCalledWith('scorer');
});

it('saves scorer definitions and distinguishes a zero score from execution failure', async () => {
  const scorer = {
    name: 'contains OK',
    kind: 'check',
    config: { checkType: 'includes', params: { value: 'OK' } },
  };
  registry.save.mockResolvedValue({ ...scorer, id: 'scorer' } as any);
  expect((await invoke('post', 'save-scorer', { body: scorer })).data.id).toBe(
    'scorer',
  );
  const run = jest.fn().mockResolvedValue({ score: 0, reason: 'missing' });
  registry.createTemporary.mockResolvedValue({ id: 'preview', run } as any);
  const body = { scorer, input: 'say OK', output: 'NO', groundTruth: 'OK' };
  expect((await invoke('post', 'test-scorer', { body })).data).toEqual({
    scorerId: 'preview',
    score: 0,
    reason: 'missing',
  });
  expect(run).toHaveBeenCalledWith({
    input: 'say OK',
    output: 'NO',
    groundTruth: 'OK',
  });
  run.mockRejectedValueOnce(new Error('judge unavailable'));
  expect((await invoke('post', 'test-scorer', { body })).data).toEqual({
    scorerId: 'preview',
    score: null,
    error: 'judge unavailable',
  });
});

it('returns pending immediately and runs the configured Agent task', async () => {
  const workspace = pathUtils.join(userData, 'custom workspace', '测评');
  const scorer = { id: 'scorer' };
  registry.get.mockResolvedValue(scorer as any);
  jest
    .mocked(agentManager.getAgent)
    .mockResolvedValue({ tools: ['tool'], subAgents: [] } as any);
  const generate = jest.fn().mockResolvedValue({ text: 'OK' });
  jest.mocked(agentManager.buildAgent).mockResolvedValue({ generate } as any);
  dataset.startExperimentAsync.mockResolvedValue({
    experimentId: 'exp',
    status: 'pending',
    totalItems: 1,
  });
  const response = await invoke('post', 'start-experiment', {
    body: {
      datasetId: 'ds',
      name: ' Test ',
      workspace,
      agentId: 'agent',
      modelId: 'provider/model',
      scorerIds: ['scorer'],
      maxConcurrency: 20,
    },
  });
  expect(response.data).toEqual({
    experimentId: 'exp',
    status: 'pending',
    totalItems: 1,
  });
  expect(registry.get).toHaveBeenCalledWith('scorer', 'provider/model');
  const options = dataset.startExperimentAsync.mock.calls[0][0];
  expect(options).toMatchObject({
    name: 'Test',
    maxConcurrency: 8,
    scorers: [scorer],
    metadata: expect.objectContaining({ workspace }),
  });
  expect((await fs.stat(workspace)).isDirectory()).toBe(true);
  const { signal } = new AbortController();
  expect(await options.task({ input: { question: 'Hi' }, signal })).toBe('OK');
  expect(generate).toHaveBeenCalledWith(
    JSON.stringify({ question: 'Hi' }, null, 2),
    expect.objectContaining({ abortSignal: signal }),
  );
  const executionContext = generate.mock.calls[0][1].requestContext;
  expect(executionContext.get('workspace')).toBe(workspace);
  expect(
    jest.mocked(agentManager.buildAgent).mock.calls[0][1].requestContext,
  ).toBe(executionContext);
  expect((await fs.stat(workspace)).isDirectory()).toBe(true);
});

it('joins sample scores and returns averages for result polling', async () => {
  dataset.getExperiment.mockResolvedValue({
    id: 'exp',
    status: 'completed',
    failedCount: 0,
  });
  dataset.listExperimentResults.mockResolvedValue({
    results: [{ itemId: 'a' }, { itemId: 'b' }],
  });
  const scores = [
    { entityId: 'a', scorerId: 'accuracy', score: 1 },
    { entityId: 'b', scorerId: 'accuracy', score: 0.5 },
  ];
  scoresStore.listScoresByRunId.mockResolvedValue({ scores });
  const response = await invoke('get', 'get-experiment', {
    query: { datasetId: 'ds', experimentId: 'exp' },
  });
  expect(dataset.getExperiment).toHaveBeenCalledWith({ experimentId: 'exp' });
  expect(response.data.results[0].scores).toEqual([scores[0]]);
  expect(response.data.scoreSummary).toEqual({
    accuracy: { total: 1.5, count: 2, average: 0.75 },
  });
});
