/* eslint-disable import/no-cycle */
/* eslint-disable no-await-in-loop -- Migrate sequentially and retain the old table on any failure. */
import type { DataSource } from 'typeorm';
import type { ProjectTimelineEntry } from '@/types/project';
import { findTimelineMemory, saveTimelineMemory } from './timeline-memory';

// TypeORM's SQLite datetime columns were stored as UTC without a timezone suffix.
function legacyDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(
    /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value,
  );
}

/** Retryable migration: the old table is dropped only after every item is durable. */
export async function migrateLegacyTimeline(
  dataSource: DataSource,
): Promise<void> {
  const tables = await dataSource.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_timeline_entries'",
  );
  if (!tables.length) return;
  const rows = await dataSource.query(
    'SELECT * FROM project_timeline_entries ORDER BY createdAt, id',
  );
  for (const row of rows) {
    const existing = await findTimelineMemory(
      row.projectId,
      row.threadId,
      row.runId,
    );
    if (!existing) {
      const entry: ProjectTimelineEntry = {
        ...row,
        deliverables:
          typeof row.deliverables === 'string'
            ? JSON.parse(row.deliverables)
            : row.deliverables,
        startedAt: legacyDate(row.startedAt),
        endedAt: legacyDate(row.endedAt),
        createdAt: legacyDate(row.createdAt),
      };
      await saveTimelineMemory(entry);
    }
  }
  await dataSource.query('DROP TABLE project_timeline_entries');
}
