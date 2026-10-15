export const EMBEDDING_GEMMA_2 = 'embeddinggemma-2';

const EMBEDDING_GEMMA_PROMPT = /^(task|title): /;

/** EmbeddingGemma 2 is trained with task prefixes; unprefixed text is embedded as a document. */
export function formatEmbeddingGemmaDocument(text: string) {
  return EMBEDDING_GEMMA_PROMPT.test(text) ? text : `title: none | text: ${text}`;
}

export function formatLocalEmbeddingQuery(embeddingModel: string, query: string) {
  return embeddingModel === `local/${EMBEDDING_GEMMA_2}`
    ? `task: search result | query: ${query}`
    : query;
}
