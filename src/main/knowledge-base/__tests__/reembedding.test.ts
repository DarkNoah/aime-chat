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
jest.mock('@mastra/rag', () => ({ MDocument: {} }));

const schemaRows = [
  { name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
  { name: 'item_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'chunk', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'is_enable', type: 'BOOLEAN', notnull: 0, dflt_value: null, pk: 0 },
  { name: 'type', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
  {
    name: 'embedding',
    type: 'F32_BLOB(2)',
    notnull: 0,
    dflt_value: null,
    pk: 0,
  },
  {
    name: 'metadata',
    type: 'TEXT',
    notnull: 0,
    dflt_value: "'{}'",
    pk: 0,
  },
];

const sourceRows = [
  {
    id: 'chunk-1',
    item_id: 'item-1',
    chunk: 'first chunk',
    is_enable: 1,
    type: 'text',
    metadata: '{}',
  },
  {
    id: 'chunk-2',
    item_id: 'item-1',
    chunk: 'second chunk',
    is_enable: 1,
    type: 'text',
    metadata: '{}',
  },
];

const result = (rows: any[] = []) => ({ rows });

const setupManager = (batchError?: Error) => {
  const kb = {
    id: 'kb-1',
    name: 'Original',
    description: 'Original description',
    embedding: 'provider/old-model',
    vectorLength: 2,
  };
  const transaction = {
    execute: jest.fn(async (statement: any) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.startsWith('SELECT')) return result(sourceRows);
      return result();
    }),
    batch: batchError
      ? jest.fn().mockRejectedValue(batchError)
      : jest.fn().mockResolvedValue([]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    closed: false,
  };
  const client = {
    execute: jest.fn(async (statement: any) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.startsWith('PRAGMA')) return result(schemaRows);
      if (sql.startsWith('SELECT')) return result(sourceRows);
      return result();
    }),
    transaction: jest.fn().mockResolvedValue(transaction),
  };
  const manager = new KnowledgeBaseManager();
  manager.knowledgeBaseRepository = {
    findOneBy: jest.fn().mockResolvedValue(kb),
    update: jest.fn(),
  } as any;
  manager.knowledgeBaseItemRepository = {
    find: jest.fn().mockResolvedValue([]),
  } as any;
  manager.libSQLClient = client as any;
  jest.spyOn(manager, 'getKnowledgeBase').mockResolvedValue({
    ...kb,
    name: 'Updated',
    embedding: 'provider/new-model',
    vectorLength: 3,
  } as any);
  return { manager, client, transaction };
};

describe('knowledge base re-embedding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(taskQueueManager.getTasksByGroup).mockResolvedValue([]);
    jest.mocked(appManager.sendEvent).mockResolvedValue(undefined);
  });

  it('commits the cached vectors and model metadata together', async () => {
    const { manager, transaction } = setupManager();
    jest.spyOn(manager, 'calcEmbeddings').mockResolvedValue({
      text_embeddings: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });

    await manager.updateKnowledgeBase('kb-1', {
      name: 'Updated',
      description: 'Updated description',
      embedding: 'provider/new-model',
      reembed: true,
    });

    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(transaction.batch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          args: expect.arrayContaining(['[1,2,3]']),
        }),
      ]),
    );
    expect(transaction.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining('UPDATE knowledgebase'),
        args: expect.arrayContaining(['provider/new-model', 3, 'kb-1']),
      }),
    );
    expect(appManager.sendEvent).toHaveBeenLastCalledWith(
      KnowledgeBaseEvent.ReembeddingProgress,
      expect.objectContaining({ stage: 'completed', progress: 100 }),
    );
  });

  it('does not open a database transaction when vector generation fails', async () => {
    const { manager, client } = setupManager();
    jest.spyOn(manager, 'calcEmbeddings').mockResolvedValue(undefined);

    await expect(
      manager.updateKnowledgeBase('kb-1', {
        name: 'Updated',
        embedding: 'provider/new-model',
        reembed: true,
      }),
    ).rejects.toThrow('unexpected result count');

    expect(client.transaction).not.toHaveBeenCalled();
    expect(manager.knowledgeBaseRepository.update).not.toHaveBeenCalled();
  });

  it('rolls back every database change when the atomic switch fails', async () => {
    const { manager, transaction } = setupManager(new Error('insert failed'));
    jest.spyOn(manager, 'calcEmbeddings').mockResolvedValue({
      text_embeddings: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });

    await expect(
      manager.updateKnowledgeBase('kb-1', {
        name: 'Updated',
        embedding: 'provider/new-model',
        reembed: true,
      }),
    ).rejects.toThrow('insert failed');

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });
});
