/** @jest-environment node */
import { appManager } from '@/main/app';
import { taskQueueManager } from '@/main/task-queue';
import { KnowledgeBaseEvent } from '@/types/knowledge-base';
import { KnowledgeBaseManager } from '../index';

jest.mock('@/main/app', () => ({
  appManager: {
    sendEvent: jest.fn(),
  },
}));

jest.mock('@/main/task-queue', () => ({
  taskQueueManager: {
    getTasksByGroup: jest.fn(),
    registerHandler: jest.fn(),
  },
}));

jest.mock('@/main/db', () => ({ dbManager: {} }));
jest.mock('@/main/utils', () => ({ getDbPath: jest.fn() }));
jest.mock('@/main/providers', () => ({ providersManager: {} }));
jest.mock('@/main/tools', () => ({ toolsManager: {} }));
jest.mock('@/main/tools/file-system/read', () => ({
  ReadBinaryFile: jest.fn(),
}));
jest.mock('@/main/tools/web/web-fetch', () => ({ WebFetch: jest.fn() }));
jest.mock('@/main/local-model/clip', () => ({ LocalCLIPModel: jest.fn() }));
jest.mock('@/utils/nanoid', () => ({ nanoid: jest.fn(() => 'temp-id') }));
jest.mock('@mastra/rag', () => ({
  MDocument: {
    fromText: (text: string) => ({ chunk: async () => [{ text }] }),
  },
}));

const setup = () => {
  const manager = new KnowledgeBaseManager();
  const kb = {
    id: 'project_memory',
    vectorLength: 0,
    vectorStoreConfig: {
      extendColumns: [{ name: 'projectId' }, { name: 'threadId' }],
    },
  };
  const rows = new Map<string, any>();
  manager.knowledgeBaseItemRepository = {
    findOneBy: jest.fn(async ({ id }) => rows.get(id)),
    findOne: jest.fn(async ({ where: { id } }) => ({
      ...rows.get(id),
      knowledgeBase: kb,
    })),
    save: jest.fn(async (item) => {
      rows.set(item.id, { ...item });
      return { ...item };
    }),
  } as any;
  manager.libSQLClient = { batch: jest.fn(async () => []) } as any;
  (manager as any).ensureFtsIndex = jest.fn(async () => undefined);
  return { manager, rows };
};
const input = {
  id: 'memory-run-1',
  kbId: 'project_memory',
  name: 'timeline.md',
  content: '# Task summary',
  metadata: { projectId: 'p1', threadId: 't1', role: 'timeline' },
  extendData: { projectId: 'p1', threadId: 't1' },
};

describe('synchronous memory item writes', () => {
  beforeEach(() => jest.clearAllMocks());
  it('returns a completed item with searchable provenance columns and preserves its ID on edits', async () => {
    const { manager, rows } = setup();
    const saved = await manager.saveMemoryTextItem(input);
    expect(saved).toMatchObject({
      id: input.id,
      state: 'completed',
      isEnable: true,
      metadata: input.metadata,
      extendData: input.extendData,
    });
    const statements = jest
      .mocked(manager.libSQLClient.batch)
      .mock.calls.flatMap(([batch]) => batch as any[]);
    expect(statements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining('"projectId", "threadId"'),
          args: expect.arrayContaining(['p1', 't1']),
        }),
      ]),
    );
    await manager.saveMemoryTextItem({
      ...input,
      content: '# Updated summary',
    });
    expect(rows.size).toBe(1);
    expect(rows.get(input.id).content).toBe('# Updated summary');
  });
  it('retains failed content and retries indexing even when the content is unchanged', async () => {
    const { manager, rows } = setup();
    jest
      .mocked(manager.libSQLClient.batch)
      .mockRejectedValueOnce(new Error('index unavailable'));
    await expect(manager.saveMemoryTextItem(input)).rejects.toThrow(
      'index unavailable',
    );
    expect(rows.get(input.id)).toMatchObject({
      state: 'fail',
      content: input.content,
      metadata: input.metadata,
    });
    const saved = await manager.saveMemoryTextItem(input);
    expect(saved.state).toBe('completed');
    expect(rows.size).toBe(1);
  });
});
