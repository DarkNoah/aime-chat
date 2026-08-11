import {
  MAX_KNOWLEDGE_BASE_LINE_LENGTH,
  readKnowledgeBaseContent,
} from './content-reader';

describe('knowledge base content reader', () => {
  it('returns line-numbered pages with a continuation reminder', async () => {
    const result = await readKnowledgeBaseContent(
      ['first', 'second', 'third'].join('\n'),
      { offset: 1, limit: 1 },
    );

    expect(result).toContain('showing lines 2-2 of 3 total lines');
    expect(result).toContain('     2→second');
    expect(result).not.toContain('     1→first');
  });

  it('searches the complete content with a safe grep command', async () => {
    const result = await readKnowledgeBaseContent(
      ['Alpha', 'beta one', 'Gamma', 'BETA two'].join('\n'),
      { grep: 'grep -in "beta"', limit: 1 },
    );

    expect(result).toContain('showing results 1-1 of 2');
    expect(result).toContain('     2→beta one');
    expect(result).not.toContain('BETA two');
  });

  it('rejects shell operators in grep commands', async () => {
    await expect(
      readKnowledgeBaseContent('alpha\nbeta', {
        grep: 'grep beta | head -1',
      }),
    ).rejects.toThrow('do not support pipes');
  });

  it('truncates overly long lines like the Read tool', async () => {
    const result = await readKnowledgeBaseContent(
      'x'.repeat(MAX_KNOWLEDGE_BASE_LINE_LENGTH + 1),
    );

    expect(result).toContain(
      `exceeded maximum length of ${MAX_KNOWLEDGE_BASE_LINE_LENGTH} characters`,
    );
    expect(result).toContain('... [truncated]');
  });
});
