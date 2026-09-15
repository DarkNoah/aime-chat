/** @jest-environment node */

import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { createClient } from '@libsql/client';
import { GraphRAG } from '@mastra/rag';
import { searchKnowledgeBaseGraph } from './graph-search';
import { createKnowledgeBaseGraphVectorStore } from './graph-vector-store';

// RAG also exports agent/tool helpers with ESM-only dependencies unused here.
// Keep GraphRAG, the embedding SDK and SQLite real in this regression suite.
jest.mock('@mastra/core/agent', () => ({}));
jest.mock('@mastra/core/tools', () => ({}));
jest.mock('@mastra/core/relevance', () => ({}));

const setupSearch = () => {
  const doEmbed = jest.fn().mockResolvedValue({ embeddings: [[1, 0, 0]] });
  const model: EmbeddingModelV2<string> = {
    specificationVersion: 'v2',
    provider: 'test',
    modelId: 'test-embedding',
    maxEmbeddingsPerCall: 1,
    supportsParallelCalls: false,
    doEmbed,
  };
  const query = jest.fn().mockResolvedValue([]);
  return {
    doEmbed,
    query,
    options: {
      vectorStore: { query },
      indexName: 'kb_test_3',
      model,
      queryText: 'connected knowledge',
      topK: 2,
      graphOptions: { dimension: 3 },
    },
  };
};

const candidate = {
  id: 'chunk-1',
  score: 0.9,
  vector: [1, 0, 0],
  metadata: { text: 'Connected knowledge', itemId: 'item-1' },
};

describe('knowledge base graph search with the installed Mastra implementation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns empty retrieval without building a graph', async () => {
    const { options, doEmbed, query } = setupSearch();
    const createGraph = jest.spyOn(GraphRAG.prototype, 'createGraph');

    await expect(searchKnowledgeBaseGraph(options)).resolves.toEqual({
      relevantContext: [],
      sources: [],
    });

    expect(createGraph).not.toHaveBeenCalled();
    expect(doEmbed).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith({
      indexName: 'kb_test_3',
      queryVector: [1, 0, 0],
      topK: 2,
      includeVector: true,
    });
  });

  it('uses real graph traversal and preserves the source contract', async () => {
    const { options, doEmbed, query } = setupSearch();
    query.mockResolvedValue([
      candidate,
      {
        id: 'chunk-2',
        score: 0.8,
        vector: [0.9, 0.1, 0],
        metadata: { text: 'Related context', itemId: 'item-2' },
      },
    ]);

    const result = await searchKnowledgeBaseGraph(options);

    expect(result.relevantContext).toEqual(
      expect.arrayContaining(['Connected knowledge', 'Related context']),
    );
    expect(result.sources).toHaveLength(2);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document: 'Connected knowledge',
          metadata: candidate.metadata,
          vector: [],
          score: expect.any(Number),
        }),
      ]),
    );
    expect(doEmbed).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['empty', 'below threshold', 'filtered', 'disabled'])(
    'handles %s candidates from a real SQLite vector query',
    async (scenario) => {
      const client = createClient({ url: ':memory:' });
      const { options } = setupSearch();
      const createGraph = jest.spyOn(GraphRAG.prototype, 'createGraph');
      try {
        await client.execute(`CREATE TABLE kb_test_3 (
          id TEXT, item_id TEXT, chunk TEXT, metadata TEXT, type TEXT,
          is_enable INTEGER, embedding BLOB, category TEXT
        )`);
        await client.execute(`CREATE TABLE knowledgebase_item (
          id TEXT, name TEXT, source TEXT, sourceType TEXT
        )`);
        if (scenario !== 'empty') {
          await client.execute({
            sql: `INSERT INTO kb_test_3 VALUES (
              'chunk-1', 'item-1', 'Some text', '{}', 'text', ?, vector32(?), ?
            )`,
            args: [
              scenario === 'disabled' ? 0 : 1,
              JSON.stringify(
                scenario === 'below threshold' ? [0, 1, 0] : [1, 0, 0],
              ),
              scenario === 'filtered' ? 'other' : 'docs',
            ],
          });
        }
        const vectorStore = createKnowledgeBaseGraphVectorStore({
          client,
          knowledgeBaseId: 'test',
          vectorLength: 3,
          minimumScore: 0.5,
          extendColumns: ['category'],
          filter: "category = 'docs'",
        });

        await expect(
          searchKnowledgeBaseGraph({ ...options, vectorStore }),
        ).resolves.toEqual({ relevantContext: [], sources: [] });
        expect(createGraph).not.toHaveBeenCalled();
      } finally {
        client.close();
      }
    },
  );

  it('can omit sources without losing retrieved context', async () => {
    const { options, query } = setupSearch();
    query.mockResolvedValue([candidate]);

    await expect(
      searchKnowledgeBaseGraph({ ...options, includeSources: false }),
    ).resolves.toEqual({
      relevantContext: ['Connected knowledge'],
      sources: [],
    });
  });

  it('does not reuse graph nodes from a previous search', async () => {
    const { options, query } = setupSearch();
    query.mockResolvedValueOnce([candidate]);
    await searchKnowledgeBaseGraph(options);

    await expect(searchKnowledgeBaseGraph(options)).resolves.toEqual({
      relevantContext: [],
      sources: [],
    });
  });

  it('propagates database failures instead of treating them as no matches', async () => {
    const { options, query } = setupSearch();
    query.mockRejectedValue(new Error('database unavailable'));

    await expect(searchKnowledgeBaseGraph(options)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('propagates embedding failures without querying the vector store', async () => {
    const { options, doEmbed, query } = setupSearch();
    doEmbed.mockRejectedValue(new Error('embedding unavailable'));

    await expect(searchKnowledgeBaseGraph(options)).rejects.toThrow(
      'embedding unavailable',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
