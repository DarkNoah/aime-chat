import { migrateLegacyTimeline } from './migrate-timeline';
import { findTimelineMemory, saveTimelineMemory } from './timeline-memory';

jest.mock('./timeline-memory', () => ({
  findTimelineMemory: jest.fn(),
  saveTimelineMemory: jest.fn(),
}));
const rows = [1, 2].map((n) => ({
  id: `old-${n}`,
  projectId: 'p1',
  threadId: 't1',
  runId: `r${n}`,
  summary: 'Task',
  detailedSummary: 'Completed',
  deliverables: '["file.ts"]',
  startedAt: '2026-09-16 01:00:00.000',
  endedAt: '2026-09-16 01:01:00.000',
  createdAt: '2026-09-16 01:01:01.000',
  durationMs: 60000,
}));
const source = (exists = true) => ({
  query: jest.fn(async (sql: string) => {
    if (sql.includes('sqlite_master'))
      return exists ? [{ name: 'project_timeline_entries' }] : [];
    if (sql.startsWith('SELECT *')) return rows;
    return [];
  }),
});

describe('legacy timeline migration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('does nothing for a fresh database', async () => {
    const db = source(false);
    await migrateLegacyTimeline(db as any);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(saveTimelineMemory).not.toHaveBeenCalled();
  });
  it('copies metadata and UTC timestamps before dropping the old table', async () => {
    const db = source();
    await migrateLegacyTimeline(db as any);
    expect(saveTimelineMemory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'old-1',
        projectId: 'p1',
        threadId: 't1',
        runId: 'r1',
        deliverables: ['file.ts'],
        startedAt: new Date('2026-09-16T01:00:00Z'),
      }),
    );
    expect(db.query).toHaveBeenLastCalledWith(
      'DROP TABLE project_timeline_entries',
    );
  });
  it('keeps the old table on failure and resumes without duplicating copied items', async () => {
    const db = source();
    jest
      .mocked(saveTimelineMemory)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce(new Error('index failed'));
    await expect(migrateLegacyTimeline(db as any)).rejects.toThrow(
      'index failed',
    );
    expect(db.query).not.toHaveBeenCalledWith(
      'DROP TABLE project_timeline_entries',
    );
    jest
      .mocked(findTimelineMemory)
      .mockResolvedValueOnce({} as any)
      .mockResolvedValueOnce(undefined);
    jest
      .mocked(saveTimelineMemory)
      .mockClear()
      .mockResolvedValue({} as any);
    await migrateLegacyTimeline(db as any);
    expect(saveTimelineMemory).toHaveBeenCalledTimes(1);
    expect(saveTimelineMemory).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r2' }),
    );
    expect(db.query).toHaveBeenLastCalledWith(
      'DROP TABLE project_timeline_entries',
    );
  });
});
