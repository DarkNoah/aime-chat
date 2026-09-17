import {
  formatTimelineMemory,
  listTimelineMemory,
  saveTimelineMemory,
  timelineEntryFromMemory,
} from './timeline-memory';
import {
  listMemoryPage,
  upsertMemoryItem,
} from '../knowledge-base/static-memory';
import type { ProjectTimelineEntry } from '@/types/project';

jest.mock('../knowledge-base/static-memory', () => ({
  getProjectMemoryItemByRun: jest.fn(),
  listMemoryPage: jest.fn(),
  upsertMemoryItem: jest.fn(),
}));
const entry: ProjectTimelineEntry = {
  id: 'entry-1',
  projectId: 'p1',
  threadId: 't1',
  runId: 'r1',
  summary: 'Changed storage',
  detailedSummary: 'User chose knowledge base storage.',
  deliverables: ['migration.ts'],
  startedAt: new Date('2026-09-16T01:00:00Z'),
  endedAt: new Date('2026-09-16T01:01:00Z'),
  durationMs: 60000,
  createdAt: new Date('2026-09-16T01:01:01Z'),
};

describe('timeline memory adapter', () => {
  beforeEach(() => jest.resetAllMocks());
  it('saves one stable page per run with provenance and readable content', async () => {
    jest.mocked(upsertMemoryItem).mockImplementation(
      async (options) =>
        ({
          id: 'kb-item',
          metadata: { ...options.metadata, role: options.role },
          state: 'completed',
        }) as any,
    );
    expect(await saveTimelineMemory(entry)).toEqual({
      ...entry,
      id: 'kb-item',
    });
    await saveTimelineMemory({ ...entry, id: 'different-generated-id' });
    const [first, second] = jest.mocked(upsertMemoryItem).mock.calls;
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].name).toBe(entry.summary);
    expect(first[0]).toMatchObject({
      scope: { type: 'project', projectId: 'p1', threadId: 't1' },
      role: 'timeline',
      metadata: { projectId: 'p1', threadId: 't1', runId: 'r1' },
    });
    expect(first[0].content).toContain('User chose knowledge base storage.');
    expect(formatTimelineMemory(entry)).toContain('- migration.ts');
    expect(formatTimelineMemory(entry)).not.toMatch(
      /Project:|Thread:|Run:|Started:|Ended:|Duration:/,
    );
  });
  it('retains the timeline UI contract while paginating only current-project timeline items', async () => {
    jest.mocked(listMemoryPage).mockResolvedValue({
      items: [
        { id: 'kb-item', metadata: { ...entry, role: 'timeline' } } as any,
      ],
      total: 3,
      offset: 2,
      limit: 2,
      hasMore: false,
    });
    expect(await listTimelineMemory('p1', 1, 2)).toMatchObject({
      items: [{ id: 'kb-item', threadId: 't1' }],
      total: 3,
      page: 1,
      size: 2,
      hasMore: false,
    });
    expect(listMemoryPage).toHaveBeenCalledWith(
      { type: 'project', projectId: 'p1' },
      { offset: 2, limit: 2, role: 'timeline' },
    );
  });
  it('does not treat ordinary memory pages or invalid metadata as timeline entries', () => {
    expect(
      timelineEntryFromMemory({
        id: 'wiki',
        metadata: { role: 'page' },
      } as any),
    ).toBeUndefined();
    expect(
      timelineEntryFromMemory({
        id: 'broken',
        metadata: { ...entry, role: 'timeline', startedAt: 'invalid' },
      } as any),
    ).toBeUndefined();
  });
});
