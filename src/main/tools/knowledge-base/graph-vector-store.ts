import type { Client as LibSQLClient } from '@libsql/client';
import type {
  MastraVector,
  QueryResult,
  QueryVectorParams,
} from '@mastra/core/vector';

export type KnowledgeBaseGraphVectorStoreOptions = {
  client: Pick<LibSQLClient, 'execute'>;
  knowledgeBaseId: string;
  vectorLength: number;
};

type QueryOnlyVectorStore = Pick<MastraVector, 'id' | 'query'>;

const getIndexName = (knowledgeBaseId: string, vectorLength: number): string =>
  `kb_${knowledgeBaseId}_${vectorLength}`;

const quoteIdentifier = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`;

const parseJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Adapts AIME's knowledge-base vector table to the query contract expected by
 * Mastra's GraphRAG tool. The adapter is deliberately read-only because
 * knowledge-base writes remain owned by KnowledgeBaseManager.
 */
export const createKnowledgeBaseGraphVectorStore = ({
  client,
  knowledgeBaseId,
  vectorLength,
}: KnowledgeBaseGraphVectorStoreOptions): MastraVector => {
  const expectedIndexName = getIndexName(knowledgeBaseId, vectorLength);

  const vectorStore: QueryOnlyVectorStore = {
    id: `knowledge-base-graph-${knowledgeBaseId}`,
    async query({
      indexName,
      queryVector,
      topK = 10,
      includeVector = false,
    }: QueryVectorParams): Promise<QueryResult[]> {
      if (indexName !== expectedIndexName) {
        throw new Error(`Unknown knowledge base vector index: ${indexName}`);
      }
      if (!queryVector) {
        throw new Error('GraphRAG requires a query vector');
      }
      if (queryVector.length !== vectorLength) {
        throw new Error(
          `Query vector dimension ${queryVector.length} does not match knowledge base dimension ${vectorLength}`,
        );
      }
      if (!Number.isInteger(topK) || topK < 1) {
        throw new Error('topK must be a positive integer');
      }

      const vectorSelect = includeVector
        ? ', vector_extract(chunks.embedding) AS embedding'
        : '';
      const result = await client.execute({
        sql: `
          SELECT
            chunks.id,
            chunks.item_id,
            chunks.chunk,
            chunks.metadata,
            items.name AS item_name,
            items.source,
            items.sourceType AS source_type,
            (1 - vector_distance_cos(chunks.embedding, vector32(?))) AS score
            ${vectorSelect}
          FROM ${quoteIdentifier(expectedIndexName)} AS chunks
          LEFT JOIN knowledgebase_item AS items ON items.id = chunks.item_id
          WHERE chunks.is_enable = 1
            AND chunks.embedding IS NOT NULL
            AND (chunks."type" IS NULL OR chunks."type" = 'text')
          ORDER BY score DESC
          LIMIT ?`,
        args: [JSON.stringify(queryVector), topK],
      });

      return result.rows.map((row) => {
        const chunk = String(row.chunk ?? '');
        const storedMetadata = parseJson(row.metadata);
        const metadata =
          storedMetadata &&
          typeof storedMetadata === 'object' &&
          !Array.isArray(storedMetadata)
            ? storedMetadata
            : {};
        const embedding = includeVector ? parseJson(row.embedding) : undefined;

        return {
          id: String(row.id),
          score: Number(row.score),
          metadata: {
            ...metadata,
            text: chunk,
            chunkId: String(row.id),
            itemId: String(row.item_id),
            itemName: row.item_name ? String(row.item_name) : undefined,
            knowledgeBaseId,
            source: parseJson(row.source),
            sourceType: row.source_type ? String(row.source_type) : undefined,
          },
          document: chunk,
          ...(Array.isArray(embedding)
            ? { vector: embedding.map((value) => Number(value)) }
            : {}),
        };
      });
    },
  };

  // createGraphRAGTool only consumes the vector store's query contract. The
  // cast keeps the adapter read-only instead of exposing misleading mutations.
  return vectorStore as MastraVector;
};

export const getKnowledgeBaseGraphIndexName = getIndexName;
