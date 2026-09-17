/* eslint-disable import/no-cycle */
import { createHash } from 'crypto';
import { z } from 'zod';
import type { KnowledgeBaseItem } from '@/entities/knowledge-base';
import type {
  ProjectTimelineEntry,
  ProjectTimelinePage,
} from '@/types/project';
import { KnowledgeBaseItemState } from '@/types/knowledge-base';
import {
  getProjectMemoryItemByRun,
  listMemoryPage,
  upsertMemoryItem,
} from '../knowledge-base/static-memory';

const storedTimelineSchema = z.object({
  role: z.literal('timeline'),
  projectId: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  summary: z.string().min(1),
  detailedSummary: z.string().min(1),
  deliverables: z.array(z.string()),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date(),
  durationMs: z.number().nonnegative(),
  createdAt: z.coerce.date(),
});

function timelineItemId(projectId: string, threadId: string, runId: string) {
  const key = createHash('sha256')
    .update(JSON.stringify([projectId, threadId, runId]))
    .digest('hex');
  return `timeline-${key}`;
}

export function timelineEntryFromMemory(
  item: KnowledgeBaseItem,
): ProjectTimelineEntry | undefined {
  const parsed = storedTimelineSchema.safeParse(item.metadata);
  if (!parsed.success) return undefined;
  const { role, ...entry } = parsed.data;
  return { ...entry, id: item.id } as ProjectTimelineEntry;
}

export function formatTimelineMemory(entry: ProjectTimelineEntry): string {
  return [
    `# ${entry.summary}`,
    entry.detailedSummary,
    ...(entry.deliverables.length
      ? [
          `## Deliverables\n\n${entry.deliverables.map((item) => `- ${item}`).join('\n')}`,
        ]
      : []),
  ].join('\n\n');
}

export async function findTimelineMemory(
  projectId: string,
  threadId: string,
  runId: string,
) {
  const item = await getProjectMemoryItemByRun(projectId, threadId, runId);
  return item?.state === KnowledgeBaseItemState.Completed
    ? timelineEntryFromMemory(item)
    : undefined;
}

export async function saveTimelineMemory(
  entry: ProjectTimelineEntry,
): Promise<ProjectTimelineEntry> {
  const existing = await getProjectMemoryItemByRun(
    entry.projectId,
    entry.threadId,
    entry.runId,
  );
  const item = await upsertMemoryItem({
    id:
      existing?.id ??
      timelineItemId(entry.projectId, entry.threadId, entry.runId),
    scope: {
      type: 'project',
      projectId: entry.projectId,
      threadId: entry.threadId,
    },
    name: entry.summary,
    role: 'timeline',
    content: formatTimelineMemory(entry),
    metadata: { ...entry },
  });
  const saved = item && timelineEntryFromMemory(item);
  if (!saved || item.state !== KnowledgeBaseItemState.Completed) {
    throw new Error('Project timeline memory could not be saved');
  }
  return saved;
}

export async function listTimelineMemory(
  projectId: string,
  page = 0,
  size = 30,
): Promise<ProjectTimelinePage> {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const safeSize = Number.isFinite(size)
    ? Math.min(100, Math.max(1, Math.floor(size)))
    : 30;
  const result = await listMemoryPage(
    { type: 'project', projectId },
    {
      offset: safePage * safeSize,
      limit: safeSize,
      role: 'timeline',
    },
  );
  return {
    items: result.items.flatMap((item) => {
      const entry = timelineEntryFromMemory(item);
      return entry ? [entry] : [];
    }),
    total: result.total,
    page: safePage,
    size: safeSize,
    hasMore: result.hasMore,
  };
}
