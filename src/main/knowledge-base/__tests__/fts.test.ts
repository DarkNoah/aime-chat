import { buildMatchQuery, rrfFuse, segmentText } from '../fts';

describe('knowledge base FTS helpers', () => {
  it('segments mixed Chinese and English text', () => {
    const segmented = segmentText('知识库 BM25 Search');

    expect(segmented).toContain('知识');
    expect(segmented).toContain('库');
    expect(segmented).toContain('bm25');
    expect(segmented).toContain('search');
  });

  it('builds an escaped OR query for FTS5', () => {
    expect(buildMatchQuery('知识库 BM25')).toBe('"知识" OR "库" OR "bm25"');
    expect(buildMatchQuery(' ! ')).toBe('');
  });

  it('fuses ranked lists by chunk id', () => {
    const fused = rrfFuse([
      [
        { id: 'shared', score: 0.9 },
        { id: 'vector-only', score: 0.8 },
      ],
      [
        { id: 'bm25-only', bm25Score: 1 },
        { id: 'shared', bm25Score: 0.5 },
      ],
    ]);

    expect(fused[0].id).toBe('shared');
    expect(fused[0].rrfScore).toBeGreaterThan(fused[1].rrfScore);
    expect(fused.find((row) => row.id === 'shared')).toMatchObject({
      score: 0.9,
      bm25Score: 0.5,
    });
  });
});
