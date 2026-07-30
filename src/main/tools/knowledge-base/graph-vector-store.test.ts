import {
  createKnowledgeBaseGraphVectorStore,
  getKnowledgeBaseGraphIndexName,
} from './graph-vector-store';

describe('knowledge base GraphRAG vector store adapter', () => {
  it('returns graph-ready chunks from an existing knowledge base table', async () => {
    const execute = jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'chunk-1',
          item_id: 'item-1',
          chunk: 'Connected knowledge',
          metadata: '{"section":"overview"}',
          item_name: 'Guide',
          source: '{"url":"https://example.com"}',
          source_type: 'web',
          score: 0.92,
          embedding: '[0.1,0.2,0.3]',
        },
      ],
    });
    const store = createKnowledgeBaseGraphVectorStore({
      client: { execute } as any,
      knowledgeBaseId: 'kb-1',
      vectorLength: 3,
    });

    const results = await store.query({
      indexName: getKnowledgeBaseGraphIndexName('kb-1', 3),
      queryVector: [0.1, 0.2, 0.3],
      topK: 5,
      includeVector: true,
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['[0.1,0.2,0.3]', 5],
      }),
    );
    expect(execute.mock.calls[0][0].sql).toContain(
      'FROM "kb_kb-1_3" AS chunks',
    );
    expect(results).toEqual([
      {
        id: 'chunk-1',
        score: 0.92,
        metadata: {
          section: 'overview',
          text: 'Connected knowledge',
          chunkId: 'chunk-1',
          itemId: 'item-1',
          itemName: 'Guide',
          knowledgeBaseId: 'kb-1',
          source: { url: 'https://example.com' },
          sourceType: 'web',
        },
        document: 'Connected knowledge',
        vector: [0.1, 0.2, 0.3],
      },
    ]);
  });

  it('rejects mismatched indexes and vector dimensions before querying', async () => {
    const execute = jest.fn();
    const store = createKnowledgeBaseGraphVectorStore({
      client: { execute } as any,
      knowledgeBaseId: 'kb-1',
      vectorLength: 3,
    });

    await expect(
      store.query({
        indexName: 'another-index',
        queryVector: [0.1, 0.2, 0.3],
      }),
    ).rejects.toThrow('Unknown knowledge base vector index');
    await expect(
      store.query({
        indexName: getKnowledgeBaseGraphIndexName('kb-1', 3),
        queryVector: [0.1, 0.2],
      }),
    ).rejects.toThrow('does not match knowledge base dimension 3');
    expect(execute).not.toHaveBeenCalled();
  });
});
