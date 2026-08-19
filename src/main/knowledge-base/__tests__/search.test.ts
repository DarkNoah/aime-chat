import { createGraphRAGTool } from '@mastra/rag';
import { providersManager } from '@/main/providers';
import { KnowledgeBaseManager } from '../index';

jest.mock('@/main/app', () => ({ appManager: {} }));
jest.mock('@/main/task-queue', () => ({
  taskQueueManager: {
    getTasksByGroup: jest.fn(),
    registerHandler: jest.fn(),
  },
}));
jest.mock('@/main/db', () => ({ dbManager: {} }));
jest.mock('@/main/utils', () => ({ getDbPath: jest.fn() }));
jest.mock('@/main/providers', () => ({
  providersManager: {
    getEmbeddingModel: jest.fn(),
    getRerankModel: jest.fn(),
  },
}));
jest.mock('@/main/tools', () => ({ toolsManager: {} }));
jest.mock('@/main/tools/file-system/read', () => ({
  ReadBinaryFile: jest.fn(),
}));
jest.mock('@/main/tools/web/web-fetch', () => ({ WebFetch: jest.fn() }));
jest.mock('@/main/local-model/clip', () => ({ LocalCLIPModel: jest.fn() }));
jest.mock('@/utils/nanoid', () => ({ nanoid: jest.fn(() => 'temp-id') }));
jest.mock('@mastra/rag', () => ({
  MDocument: {},
  createGraphRAGTool: jest.fn(),
}));

const result = (rows: any[] = []) => ({ rows });

const setupManager = () => {
  const kb = {
    id: 'kb-1',
    name: 'Docs',
    embedding: 'provider/embedding-model',
    vectorLength: 3,
    vectorStoreConfig: {
      extendColumns: [{ name: 'category', columnType: 'text' }],
    },
  };
  const manager = new KnowledgeBaseManager();
  manager.knowledgeBaseRepository = {
    findOne: jest.fn().mockResolvedValue(kb),
  } as any;
  manager.knowledgeBaseItemRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'item-shared',
        name: 'Shared guide',
        source: '/docs/shared.md',
        sourceType: 'file',
        content: 'Complete shared guide',
        metadata: { document: 'shared' },
      },
      {
        id: 'item-bm25',
        name: 'Lexical guide',
        source: '/docs/lexical.md',
        sourceType: 'file',
        content: 'Complete lexical guide',
        metadata: {},
      },
      {
        id: 'item-graph',
        name: 'Graph guide',
        source: '/docs/graph.md',
        sourceType: 'file',
        content: 'Complete graph guide',
        metadata: { document: 'graph' },
      },
    ]),
  } as any;
  manager.libSQLClient = {
    execute: jest.fn(async (statement: any) => {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      if (sql.includes(' MATCH ?')) {
        return result([
          {
            id: 'chunk-shared',
            item_id: 'item-shared',
            chunk: 'Shared lexical chunk',
            metadata: '{"section":"bm25"}',
            type: 'text',
            category: 'docs',
          },
          {
            id: 'chunk-bm25',
            item_id: 'item-bm25',
            chunk: 'Lexical-only chunk',
            metadata: '{}',
            type: 'text',
            category: 'docs',
          },
        ]);
      }
      return result();
    }),
  } as any;
  (manager as any).ensureFtsIndex = jest.fn().mockResolvedValue(undefined);
  return manager;
};

describe('KnowledgeBaseManager GraphRAG hybrid search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(providersManager.getEmbeddingModel).mockResolvedValue({
      specificationVersion: 'v2',
    } as any);
  });

  it('maps GraphRAG node metadata back into the existing hybrid row contract', async () => {
    const graphExecute = jest.fn().mockResolvedValue({
      relevantContext: ['Graph chunk'],
      sources: [
        {
          id: '0',
          score: 0.92,
          document: 'Graph chunk',
          metadata: {
            text: 'Graph chunk',
            chunkId: 'chunk-shared',
            itemId: 'item-shared',
            __knowledgeBase: {
              metadata: { section: 'graph' },
              type: 'text',
              extendValues: { category: 'docs' },
              vectorScore: 0.78,
            },
          },
        },
        {
          id: '1',
          score: 0.81,
          document: 'Graph-only chunk',
          metadata: {
            text: 'Graph-only chunk',
            chunkId: 'chunk-graph',
            itemId: 'item-graph',
            __knowledgeBase: {
              metadata: { section: 'graph-only' },
              type: 'text',
              extendValues: { category: 'docs' },
              vectorScore: 0.69,
            },
          },
        },
      ],
    });
    jest.mocked(createGraphRAGTool).mockReturnValue({
      execute: graphExecute,
    } as any);
    const manager = setupManager();

    const search = await manager.searchKnowledgeBase(
      'Docs',
      'shared question',
      'text',
      'category = "docs"',
      2,
    );

    expect(createGraphRAGTool).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: 'kb_kb-1_3',
        includeSources: true,
        graphOptions: { dimension: 3 },
      }),
    );
    expect(graphExecute).toHaveBeenCalledWith(
      { queryText: 'shared question', topK: 6 },
      expect.objectContaining({
        mastra: expect.objectContaining({ getLogger: expect.any(Function) }),
      }),
    );
    expect(search.searchType).toBe('hybrid');
    expect(search.results[0]).toMatchObject({
      id: 'chunk-shared',
      itemId: 'item-shared',
      chunk: 'Shared lexical chunk',
      metadata: {
        section: 'bm25',
        document: 'shared',
      },
      score: 0.78,
      graphScore: 0.92,
      extendValues: { category: 'docs' },
    });
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'chunk-graph',
          itemId: 'item-graph',
          chunk: 'Graph-only chunk',
          metadata: {
            section: 'graph-only',
            document: 'graph',
          },
          extendValues: { category: 'docs' },
        }),
      ]),
    );
    const bm25Call = jest
      .mocked(manager.libSQLClient.execute)
      .mock.calls.find(([statement]) =>
        String((statement as any).sql ?? statement).includes(' MATCH ?'),
      )?.[0] as any;
    expect(bm25Call.sql).toContain('AND ("category" = ?)');
    expect(bm25Call.sql).not.toContain('category = "docs"');
    expect(bm25Call.args).toEqual(expect.arrayContaining(['docs', 6]));
  });

  it('falls back to BM25 when GraphRAG produces no usable sources', async () => {
    jest.mocked(createGraphRAGTool).mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        relevantContext: [],
        sources: [],
      }),
    } as any);
    const manager = setupManager();

    const search = await manager.searchKnowledgeBase(
      'kb-1',
      'lexical question',
      'text',
      undefined,
      1,
    );

    expect(search.searchType).toBe('bm25');
    expect(search.results[0]).toMatchObject({
      id: 'chunk-shared',
      itemId: 'item-shared',
    });
  });

  it('rejects unsafe GraphRAG candidate limits before querying', async () => {
    const manager = setupManager();

    await expect(
      manager.searchKnowledgeBase('kb-1', 'question', 'text', undefined, 101),
    ).rejects.toThrow('top_k must be an integer between 1 and 100');
    expect(manager.knowledgeBaseRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects filters outside configured extended columns before searching', async () => {
    const manager = setupManager();

    await expect(
      manager.searchKnowledgeBase(
        'kb-1',
        'question',
        'text',
        "metadata = 'secret' OR category = 'docs'",
        10,
      ),
    ).rejects.toThrow('Unknown column "metadata"');
    expect(createGraphRAGTool).not.toHaveBeenCalled();
    expect(manager.libSQLClient.execute).not.toHaveBeenCalled();
  });
});
