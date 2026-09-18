/** @jest-environment node */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { migrateLegacyTimeline } from '@/main/project/migrate-timeline';
import { normalizeTimelineMemoryItems } from '@/main/project/normalize-timeline-memory';
import {
  findTimelineMemory,
  saveTimelineMemory,
} from '@/main/project/timeline-memory';
import type { ProjectTimelineEntry } from '@/types/project';
import { providersManager } from '@/main/providers';
import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { Settings } from '@/entities/settings';
import { dbManager } from '@/main/db';
import knowledgeBaseManager from '../index';
import { KnowledgeBaseSourceType } from '@/types/knowledge-base';
import {
  buildProjectTimelineDigest,
  deleteProjectMemory,
  getMemoryItemByName,
  getOrCreateMemoryKB,
  listMemoryPage,
  PROJECT_MEMORY_KB_ID,
  searchMemory,
  STATIC_MEMORY_KB_ID,
  upsertMemoryItem,
} from '../static-memory';

jest.mock('@/main/db', () => ({ dbManager: {} }));
jest.mock('@/main/providers', () => ({
  providersManager: { getAvailableEmbeddingModels: jest.fn(async () => []) },
}));
jest.mock('../index', () => ({
  __esModule: true,
  default: {
    createKnowledgeBase: jest.fn(),
    saveMemoryTextItem: jest.fn(),
    searchKnowledgeBase: jest.fn(),
    deleteKnowledgeBaseItem: jest.fn(),
  },
}));

let dataSource: DataSource;
const scope = (projectId: string, threadId = 'thread-1') => ({
  type: 'project' as const,
  projectId,
  threadId,
});
async function page(
  projectId: string,
  name: string,
  content: string,
  threadId?: string,
) {
  return upsertMemoryItem({
    scope: scope(projectId, threadId),
    name,
    content,
    role: 'page',
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest
    .mocked(providersManager.getAvailableEmbeddingModels)
    .mockResolvedValue([]);
  dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    synchronize: true,
    entities: [KnowledgeBase, KnowledgeBaseItem, Settings],
  });
  await dataSource.initialize();
  dbManager.dataSource = dataSource;
  const kbRepo = dataSource.getRepository(KnowledgeBase);
  const itemRepo = dataSource.getRepository(KnowledgeBaseItem);
  jest
    .mocked(knowledgeBaseManager.createKnowledgeBase)
    .mockImplementation(async (data) =>
      kbRepo.save({ ...data, vectorLength: 0 } as any),
    );
  jest
    .mocked(knowledgeBaseManager.saveMemoryTextItem)
    .mockImplementation(async (data) => {
      const item = new KnowledgeBaseItem(
        data.id,
        data.kbId,
        data.content,
        KnowledgeBaseSourceType.Text,
      );
      return itemRepo.save({
        ...item,
        name: data.name,
        metadata: data.metadata,
        extendData: data.extendData,
        state: 'completed',
      });
    });
  jest
    .mocked(knowledgeBaseManager.deleteKnowledgeBaseItem)
    .mockImplementation(async (id) => {
      await itemRepo.delete(id);
    });
});
afterEach(async () => dataSource?.destroy());

describe('scoped memory persistence', () => {
  it('creates one project KB with provenance columns even without embeddings', async () => {
    const [a, b, c] = await Promise.all([
      getOrCreateMemoryKB({ type: 'project' }),
      getOrCreateMemoryKB(scope('p1')),
      getOrCreateMemoryKB(scope('p2')),
    ]);
    expect(a.id).toBe(PROJECT_MEMORY_KB_ID);
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    expect(knowledgeBaseManager.createKnowledgeBase).toHaveBeenCalledTimes(1);
    expect(a.vectorStoreConfig.extendColumns).toEqual([
      { name: 'projectId', columnType: 'text' },
      { name: 'threadId', columnType: 'text' },
    ]);
    expect(a.embedding).toBeFalsy();
  });
  it('isolates same-name pages across projects and global memory', async () => {
    await dataSource.getRepository(KnowledgeBase).save({
      id: STATIC_MEMORY_KB_ID,
      name: 'Memory',
      description: 'Global',
      vectorStoreType: 'libsql',
    });
    await Promise.all([
      page('p1', 'notes.md', 'one'),
      page('p2', 'notes.md', 'two'),
      upsertMemoryItem({ name: 'notes.md', content: 'global', role: 'page' }),
    ]);
    expect((await getMemoryItemByName('notes.md', scope('p1'))).content).toBe(
      'one',
    );
    expect((await getMemoryItemByName('notes.md', scope('p2'))).content).toBe(
      'two',
    );
    expect((await getMemoryItemByName('notes.md')).content).toBe('global');
    const item = await getMemoryItemByName('notes.md', scope('p1'));
    expect(item.metadata).toMatchObject({
      projectId: 'p1',
      threadId: 'thread-1',
      role: 'page',
    });
    expect(item.extendData).toEqual({ projectId: 'p1', threadId: 'thread-1' });
  });
  it('applies project and system-page filters before offset/limit with stable ordering', async () => {
    for (const name of ['index.md', 'log.md', 'a.md', 'b.md', 'c.md'])
      await page('p1', name, name);
    await page('p2', 'private.md', 'other project');
    const first = await listMemoryPage(scope('p1'), { offset: 0, limit: 2 });
    const second = await listMemoryPage(scope('p1'), { offset: 2, limit: 2 });
    expect(first.total).toBe(3);
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.name)),
    ).toEqual(new Set(['a.md', 'b.md', 'c.md']));
    expect(
      (await listMemoryPage(scope('p1'), { offset: 10, limit: 2 })).items,
    ).toEqual([]);
  });
  it('serializes concurrent appends to the same page without losing data or duplicating items', async () => {
    await Promise.all(
      ['first', 'second', 'third'].map((content) =>
        upsertMemoryItem({
          scope: scope('p1'),
          name: 'note.md',
          content,
          mode: 'append',
          role: 'page',
        }),
      ),
    );
    expect((await getMemoryItemByName('note.md', scope('p1'))).content).toBe(
      'first\nsecond\nthird',
    );
    expect(await dataSource.getRepository(KnowledgeBaseItem).count()).toBe(1);
  });
  it('passes an escaped project filter into search before ranking and leaves global queries unfiltered', async () => {
    await getOrCreateMemoryKB(scope("project'one"));
    await searchMemory('task', 8, scope("project'one"));
    expect(knowledgeBaseManager.searchKnowledgeBase).toHaveBeenCalledWith(
      PROJECT_MEMORY_KB_ID,
      'task',
      'text',
      "\"projectId\" = 'project''one'",
      8,
    );
  });
  it('deletes source-thread or project memory without touching other scopes', async () => {
    await page('p1', 'a.md', 'a', 't1');
    await page('p1', 'b.md', 'b', 't2');
    await page('p2', 'c.md', 'c', 't3');
    await deleteProjectMemory(undefined, 't1');
    expect((await listMemoryPage(scope('p1'))).total).toBe(1);
    await deleteProjectMemory('p1');
    expect((await listMemoryPage(scope('p1'))).total).toBe(0);
    expect((await listMemoryPage(scope('p2'))).total).toBe(1);
  });
});

describe('memory initialization and legacy database transition', () => {
  it('initializes global system pages while an initial index write is pending', async () => {
    jest
      .mocked(providersManager.getAvailableEmbeddingModels)
      .mockResolvedValue([{ models: [{ id: 'provider/embed' }] }] as any);
    await upsertMemoryItem({
      name: 'index.md',
      role: 'index',
      content: '# Custom index',
    });
    expect((await getMemoryItemByName('index.md')).content).toBe(
      '# Custom index',
    );
    expect((await getMemoryItemByName('log.md')).content).toContain('# Log');
  });

  it('migrates an actual SQLite table into a scoped item and removes the old table', async () => {
    await dataSource.query(`CREATE TABLE project_timeline_entries (
      id TEXT PRIMARY KEY, projectId TEXT, threadId TEXT, runId TEXT,
      summary TEXT, detailedSummary TEXT, deliverables TEXT,
      startedAt TEXT, endedAt TEXT, createdAt TEXT, durationMs INTEGER
    )`);
    await dataSource.query(
      'INSERT INTO project_timeline_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'old-1',
        'p1',
        't1',
        'r1',
        'Migrated task',
        'Detailed result',
        '["output.md"]',
        '2026-09-16 01:00:00.000',
        '2026-09-16 01:01:00.000',
        '2026-09-16 01:01:01.000',
        60000,
      ],
    );
    await migrateLegacyTimeline(dataSource);
    const result = await listMemoryPage(scope('p1'), { role: 'timeline' });
    expect(result.total).toBe(1);
    expect(result.items[0].metadata).toMatchObject({
      projectId: 'p1',
      threadId: 't1',
      runId: 'r1',
      role: 'timeline',
      startedAt: '2026-09-16T01:00:00.000Z',
    });
    expect(result.items[0].content).toContain('Detailed result');
    expect(
      await dataSource.query(
        "SELECT name FROM sqlite_master WHERE name = 'project_timeline_entries'",
      ),
    ).toEqual([]);
    await migrateLegacyTimeline(dataSource);
    expect((await listMemoryPage(scope('p1'))).total).toBe(1);
  });
});

const timelineEntry: ProjectTimelineEntry = {
  id: 'source-id',
  projectId: 'p1',
  threadId: 't1',
  runId: 'r1',
  summary: 'Task title',
  detailedSummary: 'Detailed result',
  deliverables: ['output.md'],
  startedAt: new Date('2026-09-16T01:00:00Z'),
  endedAt: new Date('2026-09-16T01:01:00Z'),
  createdAt: new Date('2026-09-16T01:01:01Z'),
  durationMs: 60000,
};

describe('timeline item titles', () => {
  it('keeps same-title runs separate and preserves identity when the title changes', async () => {
    const first = await saveTimelineMemory(timelineEntry);
    const second = await saveTimelineMemory({ ...timelineEntry, runId: 'r2' });
    expect(first.id).not.toBe(second.id);
    const updated = await saveTimelineMemory({
      ...timelineEntry,
      summary: 'Updated title',
    });
    expect(updated.id).toBe(first.id);
    expect((await findTimelineMemory('p1', 't1', 'r1')).summary).toBe(
      'Updated title',
    );
    const items = (await listMemoryPage(scope('p1'), { role: 'timeline' }))
      .items;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.name))).toEqual(
      new Set(['Updated title', 'Task title']),
    );
    expect(items[0].content).not.toMatch(
      /Project:|Thread:|Run:|Started:|Ended:|Duration:/,
    );
  });

  it('renames legacy items and removes only their generated prefix, preserving metadata and user edits', async () => {
    const content =
      '# Task title\n\nProject: p1\nThread: t1\nRun: r1\n\nStarted: 2026-09-16T01:00:00.000Z\nEnded: 2026-09-16T01:01:00.000Z\nDuration: 60000 ms\n\nDetailed result\n\nUser added a note with Project: unchanged.';
    const legacy = await upsertMemoryItem({
      scope: scope('p1', 't1'),
      name: `timeline-${'a'.repeat(64)}.md`,
      content,
      role: 'timeline',
      metadata: { ...timelineEntry },
    });
    await normalizeTimelineMemoryItems(dataSource);
    const updated = await dataSource
      .getRepository(KnowledgeBaseItem)
      .findOneBy({ id: legacy.id });
    expect(updated.name).toBe('Task title');
    expect(updated.content).toBe(
      '# Task title\n\nDetailed result\n\nUser added a note with Project: unchanged.',
    );
    expect(updated.metadata).toEqual(
      JSON.parse(JSON.stringify(legacy.metadata)),
    );
    expect((await findTimelineMemory('p1', 't1', 'r1')).id).toBe(legacy.id);
    const saves = jest.mocked(knowledgeBaseManager.saveMemoryTextItem).mock
      .calls.length;
    await normalizeTimelineMemoryItems(dataSource);
    expect(knowledgeBaseManager.saveMemoryTextItem).toHaveBeenCalledTimes(
      saves,
    );
  });
});

it('injects the ten latest other-thread titles in the current project, ordered by task time', async () => {
  const entries = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      saveTimelineMemory({
        ...timelineEntry,
        runId: `run-${index}`,
        summary: `Title ${index}`,
        detailedSummary: 'Full content must not be injected',
        startedAt: new Date(Date.UTC(2026, 8, 16, index)),
        endedAt: new Date(Date.UTC(2026, 8, 16, index, 1)),
      }),
    ),
  );
  // Newer records from the current thread must not consume any of the ten slots.
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      saveTimelineMemory({
        ...timelineEntry,
        threadId: 'current-thread',
        runId: `current-run-${index}`,
        summary: `Current thread ${index}`,
        startedAt: new Date(Date.UTC(2026, 8, 17, index)),
        endedAt: new Date(Date.UTC(2026, 8, 17, index, 1)),
      }),
    ),
  );
  await saveTimelineMemory({
    ...timelineEntry,
    projectId: 'p2',
    summary: 'Other project',
  });
  await page('p1', 'Ordinary wiki page', 'Wiki body');
  // Item names can change independently of the structured summary; display the item title.
  await dataSource
    .getRepository(KnowledgeBaseItem)
    .update(entries[11].id, { name: 'Renamed item title' });
  const digest = await buildProjectTimelineDigest('p1', 'current-thread');
  expect(digest.split('\n')).toEqual([
    '1. "Renamed item title"',
    ...Array.from(
      { length: 9 },
      (_, index) => `${index + 2}. "Title ${10 - index}"`,
    ),
  ]);
  expect(digest).not.toMatch(
    /Current thread|Other project|Ordinary wiki|Full content/,
  );
});

it('omits the timeline digest when no records remain after excluding the current thread', async () => {
  await saveTimelineMemory(timelineEntry);
  expect(await buildProjectTimelineDigest('p1', 't1')).toBeUndefined();
  expect(
    await buildProjectTimelineDigest('empty-project', 't1'),
  ).toBeUndefined();
});
