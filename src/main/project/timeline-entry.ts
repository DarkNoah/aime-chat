import { z } from 'zod';
import type { MastraDBMessage } from '@mastra/core/agent';
import { ProjectTimelineEntry } from '@/entities/project-timeline';
import { nanoid } from '@/utils/nanoid';

export const timelineSummarySchema = z.object({
  shouldAddToTimeline: z
    .boolean()
    .describe(
      'Only true when the latest completed conversation session contains a substantive task, decision, investigation, change, or deliverable.',
    ),
  summary: z
    .string()
    .max(80)
    .describe('The shortest accurate summary of the latest completed task.'),
  detailedSummary: z
    .string()
    .max(4000)
    .describe(
      'A detailed factual summary of the task, explicit user choices, important decisions, implementation or analysis performed, validation, and any remaining limitations.',
    ),
  deliverables: z
    .array(z.string().max(240))
    .max(12)
    .describe(
      'Concrete outputs delivered in the latest session, such as changed files, documents, decisions, reports, commands, or verified results.',
    ),
});

export type TimelineSummary = z.infer<typeof timelineSummarySchema>;

export type TimelineGenerationInput = {
  projectId: string;
  threadId: string;
  runId?: string;
  modelId: string;
  startedAt: Date;
  endedAt: Date;
  messages: MastraDBMessage[];
};

export function buildTimelineEntry(
  input: TimelineGenerationInput,
  summary: TimelineSummary,
): ProjectTimelineEntry | undefined {
  if (!summary.shouldAddToTimeline) return undefined;

  const conciseSummary = summary.summary.trim();
  const detailedSummary = summary.detailedSummary.trim();
  if (!conciseSummary || !detailedSummary) return undefined;

  const entry = new ProjectTimelineEntry(nanoid());
  entry.projectId = input.projectId;
  entry.threadId = input.threadId;
  entry.runId = input.runId || nanoid();
  entry.summary = conciseSummary;
  entry.detailedSummary = detailedSummary;
  entry.deliverables = summary.deliverables
    .map((item) => item.trim())
    .filter(Boolean);
  entry.startedAt = input.startedAt;
  entry.endedAt = input.endedAt;
  entry.durationMs = Math.max(
    0,
    input.endedAt.getTime() - input.startedAt.getTime(),
  );
  return entry;
}
