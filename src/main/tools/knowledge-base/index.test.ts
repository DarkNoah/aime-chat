import { knowledgeBaseManager } from '@/main/knowledge-base';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { localModelManager } from '@/main/local-model';
import { searchKnowledgeBaseGraph } from './graph-search';
import {
  KnowledgeBaseCreate,
  KnowledgeBaseGetItem,
  KnowledgeBaseGraphSearch,
  KnowledgeBaseList,
  KnowledgeBaseSaveItem,
  KnowledgeBaseSearch,
  KnowledgeBaseToolkit,
} from './index';

jest.mock('@/main/knowledge-base', () => {
  const manager = {
    createKnowledgeBase: jest.fn(),
    getKnowledgeBase: jest.fn(),
    getKnowledgeBaseItem: jest.fn(),
    getKnowledgeBaseList: jest.fn(),
    getKnowledgeBaseItemCounts: jest.fn(),
    searchKnowledgeBase: jest.fn(),
    importSource: jest.fn(),
    updateKnowledgeBaseItem: jest.fn(),
    libSQLClient: { execute: jest.fn() },
  };
  return {
    __esModule: true,
    default: manager,
    knowledgeBaseManager: manager,
  };
});
jest.mock('@/main/providers', () => ({
  providersManager: {
    getEmbeddingModel: jest.fn(),
  },
}));
jest.mock('@/main/app', () => ({
  appManager: {
    getInfo: jest.fn(),
  },
}));
jest.mock('@/main/local-model', () => ({
  localModelManager: { getList: jest.fn() },
}));
jest.mock('./graph-search', () => ({
  searchKnowledgeBaseGraph: jest.fn(),
}));

describe('KnowledgeBaseList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the item count for each knowledge base', async () => {
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseList).mockResolvedValue([
      {
        id: 'kb-1',
        name: 'Docs',
        description: 'Product documentation',
        vectorStoreConfig: {
          extendColumns: [{ name: 'category', columnType: 'text' }],
        },
      } as any,
      { id: 'kb-2', name: 'Notes' } as any,
    ]);
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseItemCounts).mockResolvedValue({
      'kb-1': 12,
      'kb-2': 3,
    });

    const result = await new KnowledgeBaseList().execute({}, {} as any);

    expect(result).toEqual([
      {
        id: 'kb-1',
        name: 'Docs',
        description: 'Product documentation',
        itemCount: 12,
        extendColumns: [{ name: 'category', columnType: 'text' }],
      },
      {
        id: 'kb-2',
        name: 'Notes',
        description: undefined,
        itemCount: 3,
        extendColumns: undefined,
      },
    ]);
  });
});

describe('KnowledgeBaseCreate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(appManager.getInfo).mockResolvedValue({
      defaultModel: {
        embeddingModel: 'provider/default-embedding',
        rerankerModel: 'provider/default-reranker',
      },
    } as any);
    jest.mocked(knowledgeBaseManager.createKnowledgeBase).mockResolvedValue({
      id: 'kb-created',
    } as any);
  });

  it('allows embeddingModel to be omitted and uses the global default', async () => {
    const tool = new KnowledgeBaseCreate();

    expect(tool.inputSchema.safeParse({ name: 'Default model KB' }).success).toBe(
      true,
    );

    await tool.execute({ name: 'Default model KB' });

    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Default model KB',
        embedding: 'provider/default-embedding',
        reranker: 'provider/default-reranker',
      }),
    );
  });

  it('prefers an explicitly provided embedding model', async () => {
    await new KnowledgeBaseCreate().execute({
      name: 'Explicit model KB',
      embeddingModel: 'provider/explicit-embedding',
    });

    expect(appManager.getInfo).toHaveBeenCalledTimes(1);
    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: 'provider/explicit-embedding',
        reranker: 'provider/default-reranker',
      }),
    );
  });

  it('reports missing local embedding and reranker models before creating any knowledge base', async () => {
    jest.mocked(localModelManager.getList).mockResolvedValue({
      embedding: [{ id: 'bge-m3', type: 'embedding', isDownloaded: false }],
      reranker: [{ id: 'bge-reranker-base', type: 'reranker', isDownloaded: false }],
      clip: [], ocr: [], other: [],
    });
    const result = await new KnowledgeBaseCreate().execute({
      name: 'Local KB', embeddingModel: 'local/bge-m3', rerankerModel: 'local/bge-reranker-base',
    });
    expect(result).toMatchObject({
      success: false,
      missingModels: [
        { type: 'embedding', modelId: 'bge-m3' },
        { type: 'reranker', modelId: 'bge-reranker-base' },
      ],
    });
    expect(knowledgeBaseManager.createKnowledgeBase).not.toHaveBeenCalled();
  });

  it('creates with the explicit local pair after downloads complete, without changing global defaults', async () => {
    jest.mocked(localModelManager.getList).mockResolvedValue({
      embedding: [{ id: 'bge-m3', isDownloaded: true }],
      reranker: [{ id: 'bge-reranker-base', isDownloaded: true }],
      clip: [], ocr: [], other: [],
    });
    const result = await new KnowledgeBaseCreate().execute({
      name: 'Local KB', embeddingModel: 'local/bge-m3', rerankerModel: 'local/bge-reranker-base',
    });
    expect(result.success).toBe(true);
    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
      embedding: 'local/bge-m3', reranker: 'local/bge-reranker-base',
    }));
  });

  it('allows the user to disable reranking without affecting the global default', async () => {
    await new KnowledgeBaseCreate().execute({ name: 'No reranker', rerankerModel: '' });
    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
      embedding: 'provider/default-embedding', reranker: undefined,
    }));
    expect(localModelManager.getList).not.toHaveBeenCalled();
  });

  it('guides model setup instead of silently creating a keyword-only knowledge base', async () => {
    jest.mocked(appManager.getInfo).mockResolvedValue({ defaultModel: {} } as any);
    const result = await new KnowledgeBaseCreate().execute({ name: 'Needs models' });
    expect(result).toMatchObject({ success: false, needsModelSetup: true });
    expect(knowledgeBaseManager.createKnowledgeBase).not.toHaveBeenCalled();
  });

  it('allows an explicitly requested keyword-only knowledge base despite configured defaults', async () => {
    await new KnowledgeBaseCreate().execute({ name: 'Keyword KB', embeddingModel: '', rerankerModel: '' });
    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledWith(expect.objectContaining({
      embedding: undefined, reranker: undefined,
    }));
  });
});

describe('KnowledgeBaseGraphSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is included in the knowledge base toolkit', () => {
    const toolkit = new KnowledgeBaseToolkit();

    expect(toolkit.getTools().map((tool) => tool.id)).toContain(
      KnowledgeBaseGraphSearch.toolName,
    );
  });

  it('configures and runs Mastra GraphRAG for the selected knowledge base', async () => {
    const embeddingModel = { specificationVersion: 'v2' };
    const graphResult = {
      relevantContext: ['direct context', 'connected context'],
      sources: [{ id: '0', score: 1, metadata: { itemId: 'item-1' } }],
    };
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseList).mockResolvedValue([
      {
        id: 'kb-1',
        name: 'Product docs',
        embedding: 'provider/embedding-model',
        vectorLength: 3,
      } as any,
    ]);
    jest
      .mocked(providersManager.getEmbeddingModel)
      .mockResolvedValue(embeddingModel as any);
    jest.mocked(searchKnowledgeBaseGraph).mockResolvedValue(graphResult);

    const result = await new KnowledgeBaseGraphSearch().execute({
      query: 'How do the components depend on each other?',
      kb_source: 'Product docs',
      top_k: 8,
      threshold: 0.75,
      random_walk_steps: 120,
      restart_probability: 0.2,
      include_sources: true,
    });

    expect(searchKnowledgeBaseGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        queryText: 'How do the components depend on each other?',
        topK: 8,
        indexName: 'kb_kb-1_3',
        model: embeddingModel,
        includeSources: true,
        graphOptions: {
          dimension: 3,
          threshold: 0.75,
          randomWalkSteps: 120,
          restartProb: 0.2,
        },
      }),
    );
    expect(result).toEqual({
      knowledgeBase: {
        id: 'kb-1',
        name: 'Product docs',
      },
      ...graphResult,
    });
  });
});

describe('KnowledgeBaseGetItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseItem).mockResolvedValue({
      id: 'item-1',
      knowledgeBaseId: 'kb-1',
      name: 'Guide',
      source: { path: '/docs/guide.md' },
      content: 'first\nsecond\nthird',
      extendData: { category: 'docs' },
    } as any);
    jest.mocked(knowledgeBaseManager.getKnowledgeBase).mockResolvedValue({
      id: 'kb-1',
      name: 'Docs',
      forceReturnFullContent: false,
    } as any);
  });

  it('returns a bounded line-numbered content page with a reminder', async () => {
    const result = await new KnowledgeBaseGetItem().execute({
      item_id: 'item-1',
      format: 'json',
      offset: 1,
      limit: 1,
    });

    expect(result).toMatchObject({
      id: 'item-1',
      title: 'Guide',
      extendData: { category: 'docs' },
    });
    expect((result as any).content).toContain(
      'showing lines 2-2 of 3 total lines',
    );
    expect((result as any).content).toContain('     2→second');
  });

  it('ignores grep and pagination when the knowledge base forces full content', async () => {
    jest.mocked(knowledgeBaseManager.getKnowledgeBase).mockResolvedValue({
      id: 'kb-1',
      name: 'Docs',
      forceReturnFullContent: true,
    } as any);

    const result = await new KnowledgeBaseGetItem().execute({
      item_id: 'item-1',
      format: 'json',
      pattern: 'does-not-match',
      offset: 2,
      limit: 1,
    });

    expect((result as any).content).toBe('first\nsecond\nthird');
  });

  it('reports a missing parent knowledge base explicitly', async () => {
    jest
      .mocked(knowledgeBaseManager.getKnowledgeBase)
      .mockResolvedValue(undefined as any);

    await expect(
      new KnowledgeBaseGetItem().execute({
        item_id: 'item-1',
        format: 'json',
      }),
    ).rejects.toThrow('Knowledge base not found: kb-1');
  });
});

describe('KnowledgeBaseSaveItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseList).mockResolvedValue([
      { id: 'kb-1', name: 'Docs' } as any,
    ]);
    jest.mocked(knowledgeBaseManager.getKnowledgeBase).mockResolvedValue({
      id: 'kb-1',
      name: 'Docs',
      vectorStoreConfig: {
        extendColumns: [{ columnType: 'text', name: 'category' }],
      },
    } as any);
    jest.mocked(knowledgeBaseManager.getKnowledgeBaseItem).mockResolvedValue({
      id: 'item-1',
      knowledgeBaseId: 'kb-1',
      name: 'Guide',
      content: 'old content',
    } as any);
    jest
      .mocked(knowledgeBaseManager.updateKnowledgeBaseItem)
      .mockResolvedValue({ id: 'item-1' } as any);
  });

  it('replaces KnowledgeBaseAdd in the knowledge base toolkit', () => {
    const toolIds = new KnowledgeBaseToolkit().getTools().map((tool) => tool.id);

    expect(toolIds).toContain(KnowledgeBaseSaveItem.toolName);
    expect(toolIds).not.toContain('KnowledgeBaseAdd');
  });

  it('imports a new source when item_id is omitted', async () => {
    const result = await new KnowledgeBaseSaveItem().execute({
      kb_source: 'Docs',
      type: 'text' as any,
      source: 'hello',
      extendColumns: [{ column: 'category', value: 'docs' }],
    });

    expect(knowledgeBaseManager.importSource).toHaveBeenCalledWith({
      kbId: 'kb-1',
      source: { content: 'hello', name: undefined },
      type: 'text',
      extendColumns: [{ column: 'category', value: 'docs' }],
    });
    expect(result).toEqual({ success: true, knowledgeBaseId: 'kb-1' });
  });

  it.each([
    ['text' as const, 'hello', { content: 'hello', name: 'Release notes' }],
    ['file' as const, '/docs/a.md', { files: ['/docs/a.md'], name: 'Release notes' }],
    ['web' as const, 'https://example.com', { url: 'https://example.com', name: 'Release notes' }],
  ])('titles a new %s item with the name parameter', async (type, source, expected) => {
    await new KnowledgeBaseSaveItem().execute({
      kb_source: 'Docs',
      type: type as any,
      source,
      name: '  Release notes  ',
    });

    expect(knowledgeBaseManager.importSource).toHaveBeenCalledWith(
      expect.objectContaining({ source: expected, type }),
    );
  });

  it('updates an existing item by item_id', async () => {
    const result = await new KnowledgeBaseSaveItem().execute({
      item_id: 'item-1',
      source: 'new content',
      name: 'New guide',
      extendColumns: [{ column: 'category', value: 'guides' }],
    });

    expect(knowledgeBaseManager.importSource).not.toHaveBeenCalled();
    expect(knowledgeBaseManager.updateKnowledgeBaseItem).toHaveBeenCalledWith(
      'item-1',
      {
        name: 'New guide',
        content: 'new content',
        extendData: { category: 'guides' },
      },
    );
    expect(result).toEqual({
      success: true,
      itemId: 'item-1',
      knowledgeBaseId: 'kb-1',
    });
  });

  it('rejects extend columns that the knowledge base does not define', async () => {
    await expect(
      new KnowledgeBaseSaveItem().execute({
        item_id: 'item-1',
        extendColumns: [{ column: 'unknown', value: 1 }],
      }),
    ).rejects.toThrow('Extend column unknown not found in knowledge base.');
    expect(knowledgeBaseManager.updateKnowledgeBaseItem).not.toHaveBeenCalled();
  });

  it('requires at least one updatable field in update mode', async () => {
    await expect(
      new KnowledgeBaseSaveItem().execute({ item_id: 'item-1' }),
    ).rejects.toThrow('Nothing to update.');
  });

  it('requires kb_source, type and source in create mode', async () => {
    await expect(
      new KnowledgeBaseSaveItem().execute({ source: 'hello' }),
    ).rejects.toThrow(
      'kb_source, type and source are required when creating a new item.',
    );
  });
});

describe('KnowledgeBaseSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('points callers to KnowledgeBaseGetItem for source text', () => {
    const description = new KnowledgeBaseSearch().description;

    expect(description).toContain(
      'call KnowledgeBaseGetItem with the returned item id',
    );
    expect(description).toContain(
      'use its pattern parameter to locate relevant passages and offset/limit',
    );
    expect(description).toContain(
      "Example: category = 'docs' AND (year >= 2024 OR featured = TRUE)",
    );
  });

  it('honors the knowledge base force-full-content setting', async () => {
    jest.mocked(knowledgeBaseManager.searchKnowledgeBase).mockResolvedValue({
      query: 'question',
      embedding: '',
      searchType: 'bm25',
      knowledgeBaseId: 'kb-1',
      forceReturnFullContent: true,
      results: [
        {
          id: 'chunk-1',
          itemId: 'item-1',
          score: 1,
          hybridScore: 1,
          metadata: {},
          chunk: 'matching chunk',
          content: 'complete source text',
          type: 'text',
          name: 'Guide',
        },
      ],
    });

    const result = await new KnowledgeBaseSearch().execute(
      {
        query: 'question',
        query_type: 'text',
        kb_source: ['kb-1'],
        top_k: 10,
        return_full_content: false,
      },
      {} as any,
    );

    expect(result['kb-1'][0].content).toBe('complete source text');
  });

  it('forwards the SQL-like where parameter to every knowledge base search', async () => {
    jest.mocked(knowledgeBaseManager.searchKnowledgeBase).mockResolvedValue({
      query: 'question',
      embedding: '',
      searchType: 'bm25',
      results: [],
    });

    await new KnowledgeBaseSearch().execute(
      {
        query: 'question',
        query_type: 'text',
        kb_source: ['Docs'],
        where: "category = 'docs' AND year >= 2024",
        top_k: 7,
      },
      {} as any,
    );

    expect(knowledgeBaseManager.searchKnowledgeBase).toHaveBeenCalledWith(
      'Docs',
      'question',
      'text',
      "category = 'docs' AND year >= 2024",
      7,
    );
  });

  it('limits top_k to a safe GraphRAG range', () => {
    const schema = new KnowledgeBaseSearch().inputSchema;

    expect(
      schema.safeParse({ query: 'q', kb_source: ['kb-1'], top_k: 100 })
        .success,
    ).toBe(true);
    expect(
      schema.safeParse({ query: 'q', kb_source: ['kb-1'], top_k: 101 })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ query: 'q', kb_source: ['kb-1'], top_k: 1.5 })
        .success,
    ).toBe(false);
  });
});
