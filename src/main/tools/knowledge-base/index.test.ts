import { knowledgeBaseManager } from '@/main/knowledge-base';
import { appManager } from '@/main/app';
import { providersManager } from '@/main/providers';
import { createGraphRAGTool } from '@mastra/rag';
import {
  KnowledgeBaseCreate,
  KnowledgeBaseGraphSearch,
  KnowledgeBaseToolkit,
} from './index';

jest.mock('@/main/knowledge-base', () => {
  const manager = {
    createKnowledgeBase: jest.fn(),
    getKnowledgeBaseList: jest.fn(),
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
jest.mock('@mastra/rag', () => ({
  createGraphRAGTool: jest.fn(),
}));

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
      sources: [{ id: '0', metadata: { itemId: 'item-1' } }],
    };
    const graphExecute = jest.fn().mockResolvedValue(graphResult);
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
    jest.mocked(createGraphRAGTool).mockReturnValue({
      execute: graphExecute,
    } as any);

    const result = await new KnowledgeBaseGraphSearch().execute({
      query: 'How do the components depend on each other?',
      kb_source: 'Product docs',
      top_k: 8,
      threshold: 0.75,
      random_walk_steps: 120,
      restart_probability: 0.2,
      include_sources: true,
    });

    expect(createGraphRAGTool).toHaveBeenCalledWith(
      expect.objectContaining({
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
    expect(graphExecute).toHaveBeenCalledWith(
      {
        queryText: 'How do the components depend on each other?',
        topK: 8,
      },
      {},
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
