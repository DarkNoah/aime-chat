import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { embedV2 } from '@mastra/core/vector';
import type { MastraVector, QueryResult } from '@mastra/core/vector' with {
  'resolution-mode': 'import',
};
import { GraphRAG } from '@mastra/rag';

type KnowledgeBaseGraphSearchOptions = {
  vectorStore: Pick<MastraVector, 'query'>;
  indexName: string;
  model: EmbeddingModelV2<string>;
  queryText: string;
  topK: number;
  includeSources?: boolean;
  abortSignal?: AbortSignal;
  graphOptions: {
    dimension: number;
    threshold?: number;
    randomWalkSteps?: number;
    restartProb?: number;
  };
};

export const searchKnowledgeBaseGraph = async ({
  vectorStore,
  indexName,
  model,
  queryText,
  topK,
  includeSources = true,
  abortSignal,
  graphOptions,
}: KnowledgeBaseGraphSearchOptions): Promise<{
  relevantContext: string[];
  sources: QueryResult[];
}> => {
  const { embedding } = await embedV2({
    model,
    value: queryText,
    maxRetries: 2,
    abortSignal,
  });
  const candidates = await vectorStore.query({
    indexName,
    queryVector: embedding,
    topK,
    includeVector: true,
  });

  // @mastra/rag's tool builds a graph even when retrieval has no matches.
  // Empty retrieval is normal (including score/filter exclusions), not an error.
  if (candidates.length === 0) {
    return { relevantContext: [], sources: [] };
  }

  const graph = new GraphRAG(graphOptions.dimension, graphOptions.threshold);
  graph.createGraph(
    candidates.map((candidate) => ({
      text: candidate.metadata?.text ?? candidate.document ?? '',
      metadata: candidate.metadata ?? {},
    })),
    candidates.map((candidate) => ({ vector: candidate.vector ?? [] })),
  );
  const results = graph.query({
    query: embedding,
    topK,
    randomWalkSteps: graphOptions.randomWalkSteps,
    restartProb: graphOptions.restartProb,
  });

  return {
    relevantContext: results.map((result) => result.content),
    sources: includeSources
      ? results.map((result) => ({
          id: result.id,
          vector: result.embedding ?? [],
          score: result.score,
          metadata: result.metadata,
          document: result.content,
        }))
      : [],
  };
};
