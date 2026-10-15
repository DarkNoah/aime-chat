/** @jest-environment node */
import {
  formatEmbeddingGemmaDocument,
  formatLocalEmbeddingQuery,
} from '../embedding-prompts';

it('embeds unprefixed EmbeddingGemma text as a document without double prefixes', () => {
  expect(formatEmbeddingGemmaDocument('Mars is red')).toBe(
    'title: none | text: Mars is red',
  );
  const query = formatLocalEmbeddingQuery('local/embeddinggemma-2', 'red planet');
  expect(query).toBe('task: search result | query: red planet');
  expect(formatEmbeddingGemmaDocument(query)).toBe(query);
  expect(formatEmbeddingGemmaDocument('title: Mars | text: red')).toBe(
    'title: Mars | text: red',
  );
});

it.each(['local/bge-m3', 'ollama/embeddinggemma-2'])(
  'leaves %s queries unchanged',
  (model) => {
    expect(formatLocalEmbeddingQuery(model, 'red planet')).toBe('red planet');
  },
);
