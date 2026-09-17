/* eslint-disable import/no-cycle */
/* eslint-disable no-await-in-loop -- Reindex legacy items sequentially and retry failures on the next access. */
import type { DataSource } from 'typeorm';
import { KnowledgeBaseItem } from '@/entities/knowledge-base';
import { KnowledgeBaseItemState } from '@/types/knowledge-base';
import {
  PROJECT_MEMORY_KB_ID,
  upsertMemoryItem,
} from '../knowledge-base/static-memory';
import { timelineEntryFromMemory } from './timeline-memory';

/** Update only the old generated presentation, preserving IDs, metadata and manual edits. */
export async function normalizeTimelineMemoryItems(
  dataSource: DataSource,
): Promise<void> {
  const items = await dataSource
    .getRepository(KnowledgeBaseItem)
    .createQueryBuilder('item')
    .where('item.knowledgeBaseId = :kbId', { kbId: PROJECT_MEMORY_KB_ID })
    .andWhere("json_extract(item.metadata, '$.role') = 'timeline'")
    .andWhere(
      '(item.name LIKE :legacyName OR item.content LIKE :legacyContent OR item.state = :failed)',
      {
        legacyName: 'timeline-%.md',
        legacyContent: '# %\n\nProject: %\nThread: %\nRun: %\n\nStarted: %',
        failed: KnowledgeBaseItemState.Fail,
      },
    )
    .getMany();
  for (const item of items) {
    const entry = timelineEntryFromMemory(item);
    if (!entry) {
      // Ignore unrelated or malformed records rather than rewriting their content.
      // eslint-disable-next-line no-continue
      continue;
    }
    const name = /^timeline-[a-f0-9]{64}\.md$/.test(item.name)
      ? entry.summary
      : item.name;
    const heading = `# ${entry.summary}\n\n`;
    const legacyPrefix = `${heading}Project: ${entry.projectId}\nThread: ${entry.threadId}\nRun: ${entry.runId}\n\nStarted: ${new Date(entry.startedAt).toISOString()}\nEnded: ${new Date(entry.endedAt).toISOString()}\nDuration: ${entry.durationMs} ms\n\n`;
    const content = item.content?.startsWith(legacyPrefix)
      ? `${heading}${item.content.slice(legacyPrefix.length)}`
      : item.content;
    if (
      name !== item.name ||
      content !== item.content ||
      item.state === KnowledgeBaseItemState.Fail
    ) {
      await upsertMemoryItem({
        id: item.id,
        scope: {
          type: 'project',
          projectId: entry.projectId,
          threadId: entry.threadId,
        },
        name,
        content,
        role: 'timeline',
        metadata: item.metadata,
      });
    }
  }
}
