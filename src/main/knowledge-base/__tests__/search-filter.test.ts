import { compileKnowledgeBaseFilter } from '../search-filter';

const extendColumns = [
  { name: 'category', columnType: 'text' as const },
  { name: 'year', columnType: 'number' as const },
  { name: 'featured', columnType: 'boolean' as const },
  { name: 'review status', columnType: 'text' as const },
];

describe('knowledge base search where compiler', () => {
  it('compiles SQL-like conditions to placeholders over extended columns', () => {
    expect(
      compileKnowledgeBaseFilter(
        "category = 'docs' AND (year >= 2024 OR featured = TRUE)",
        extendColumns,
      ),
    ).toEqual({
      sql: '"category" = ? AND ("year" >= ? OR "featured" = ?)',
      args: ['docs', 2024, true],
    });
  });

  it('supports IN, LIKE, NULL checks, and bracketed column names', () => {
    expect(
      compileKnowledgeBaseFilter(
        "category IN ('docs', 'api') AND [review status] NOT LIKE 'archived%' OR year IS NULL",
        extendColumns,
      ),
    ).toEqual({
      sql: '"category" IN (?, ?) AND "review status" NOT LIKE ? OR "year" IS NULL',
      args: ['docs', 'api', 'archived%'],
    });
  });

  it('rejects unknown columns and arbitrary SQL', () => {
    expect(() =>
      compileKnowledgeBaseFilter("metadata = 'secret'", extendColumns),
    ).toThrow('Unknown column "metadata"');
    expect(() =>
      compileKnowledgeBaseFilter(
        "category = 'docs'; DROP TABLE knowledgebase",
        extendColumns,
      ),
    ).toThrow('Unexpected token');
    expect(() =>
      compileKnowledgeBaseFilter("lower(category) = 'docs'", extendColumns),
    ).toThrow('Unknown column "lower"');
  });

  it('requires configured extended columns when where is present', () => {
    expect(() => compileKnowledgeBaseFilter("category = 'docs'", [])).toThrow(
      'requires at least one configured extended column',
    );
    expect(compileKnowledgeBaseFilter('  ', [])).toBeUndefined();
  });
});
