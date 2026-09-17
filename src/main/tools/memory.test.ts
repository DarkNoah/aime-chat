import {
  MemoryRead,
  MemorySearch,
  MemoryList,
  MemoryWrite,
} from './memory/memory';
import {
  getMemoryItemByName,
  getMemoryItemById,
  listMemoryPage,
  searchMemory,
  upsertMemoryItem,
} from '@/main/knowledge-base/static-memory';

jest.mock('@/main/knowledge-base/static-memory', () => ({
  INDEX_DOC_NAME: 'index.md',
  LOG_DOC_NAME: 'log.md',
  getOrCreateMemoryKB: jest.fn(async () => ({ id: 'memory' })),
  getMemoryItemByName: jest.fn(),
  getMemoryItemById: jest.fn(),
  listMemoryPage: jest.fn(),
  searchMemory: jest.fn(),
  upsertMemoryItem: jest.fn(),
  appendToLog: jest.fn(),
}));
jest.mock('@/main/knowledge-base', () => ({
  __esModule: true,
  default: { deleteKnowledgeBaseItem: jest.fn() },
}));
const context = {
  requestContext: {
    get: (key: string) => ({ resourceId: 'project:p1', threadId: 't1' })[key],
  },
} as any;
const projectScope = { type: 'project', projectId: 'p1', threadId: 't1' };

describe('Memory tools', () => {
  beforeEach(() => jest.clearAllMocks());
  it('reads the current project by default and supports an explicit global override', async () => {
    jest
      .mocked(getMemoryItemByName)
      .mockResolvedValue({ content: 'content' } as any);
    const tool = new MemoryRead();
    expect(
      await tool.execute(
        tool.inputSchema.parse({ target: 'page', name: 'note.md' }),
        context,
      ),
    ).toBe('content');
    expect(getMemoryItemByName).toHaveBeenLastCalledWith(
      'note.md',
      projectScope,
    );
    await tool.execute(
      tool.inputSchema.parse({
        target: 'page',
        name: 'note.md',
        type: 'global',
      }),
      context,
    );
    expect(getMemoryItemByName).toHaveBeenLastCalledWith('note.md', {
      type: 'global',
    });
  });
  it('searches only the selected scope', async () => {
    jest.mocked(searchMemory).mockResolvedValue({ results: [] } as any);
    const tool = new MemorySearch();
    await tool.execute(tool.inputSchema.parse({ query: 'task' }), context);
    expect(searchMemory).toHaveBeenCalledWith('task', 8, projectScope);
  });
  it('lists using only offset/limit and exposes the next offset', async () => {
    jest.mocked(listMemoryPage).mockResolvedValue({
      items: [{ name: 'note.md', metadata: { role: 'timeline' } } as any],
      total: 4,
      offset: 2,
      limit: 1,
      hasMore: true,
    });
    const tool = new MemoryList();
    expect(tool.inputSchema.shape).not.toHaveProperty('page');
    const output = await tool.execute(
      tool.inputSchema.parse({ offset: 2, limit: 1 }),
      context,
    );
    expect(listMemoryPage).toHaveBeenCalledWith(projectScope, {
      offset: 2,
      limit: 1,
    });
    expect(output).toContain('nextOffset: 3');
    expect(tool.inputSchema.safeParse({ offset: -1 }).success).toBe(false);
    expect(tool.inputSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it('writes into the same inferred project scope as reads', async () => {
    const tool = new MemoryWrite();
    await tool.execute(
      tool.inputSchema.parse({
        target: 'page',
        name: 'notes',
        content: 'decision',
      }),
      context,
    );
    expect(upsertMemoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: projectScope,
        name: 'notes.md',
        content: 'decision',
      }),
    );
  });
});

it('reads an exact item ID within the selected scope when titles repeat', async () => {
  jest
    .mocked(getMemoryItemById)
    .mockResolvedValue({ content: 'Second task with the same title' } as any);
  const tool = new MemoryRead();
  expect(
    await tool.execute(
      tool.inputSchema.parse({ target: 'page', itemId: 'second-run' }),
      context,
    ),
  ).toBe('Second task with the same title');
  expect(getMemoryItemById).toHaveBeenCalledWith('second-run', projectScope);
});
