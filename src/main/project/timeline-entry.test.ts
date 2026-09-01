import {
  buildTimelineEntry,
  selectLatestTimelineMessages,
  timelineSummarySchema,
  type TimelineGenerationInput,
} from './timeline-entry';
import type { MastraDBMessage } from '@mastra/core/agent';

jest.mock('@/utils/nanoid', () => ({ nanoid: () => 'generated-id' }));

const createInput = (
  overrides: Partial<TimelineGenerationInput> = {},
): TimelineGenerationInput => ({
  projectId: 'project-1',
  threadId: 'thread-1',
  runId: 'run-1',
  modelId: 'provider/model',
  startedAt: new Date('2026-08-31T08:00:00.000Z'),
  endedAt: new Date('2026-08-31T08:02:03.000Z'),
  messages: [],
  ...overrides,
});

const createMessage = (
  id: string,
  role: 'user' | 'assistant',
  metadata: Record<string, boolean> = {},
): MastraDBMessage =>
  ({
    id,
    role,
    threadId: 'thread-1',
    resourceId: 'project-1',
    createdAt: new Date('2026-08-31T08:00:00.000Z'),
    type: 'v2',
    content: {
      format: 2,
      parts: [{ type: 'text', text: id }],
      metadata,
    },
  }) as MastraDBMessage;

describe('project timeline entry', () => {
  it('does not create a row for a conversation without a substantive task', () => {
    expect(
      buildTimelineEntry(createInput(), {
        shouldAddToTimeline: false,
        summary: '',
        detailedSummary: '',
        deliverables: [],
      }),
    ).toBeUndefined();
  });

  it('stores runtime timing and the detailed summary with user choices', () => {
    const entry = buildTimelineEntry(createInput(), {
      shouldAddToTimeline: true,
      summary: '  Added the project timeline  ',
      detailedSummary:
        'The user chose project-level opt-in and asked for choices to remain inside this detailed summary.',
      deliverables: [' Timeline table ', '', ' Timeline tab '],
    });

    expect(entry).toMatchObject({
      projectId: 'project-1',
      threadId: 'thread-1',
      runId: 'run-1',
      summary: 'Added the project timeline',
      detailedSummary:
        'The user chose project-level opt-in and asked for choices to remain inside this detailed summary.',
      deliverables: ['Timeline table', 'Timeline tab'],
      durationMs: 123000,
    });
  });

  it('validates concise and detailed output limits', () => {
    expect(
      timelineSummarySchema.safeParse({
        shouldAddToTimeline: true,
        summary: 'x'.repeat(81),
        detailedSummary: 'Detailed summary',
        deliverables: [],
      }).success,
    ).toBe(false);
  });

  it('selects messages beginning with the latest real user input', () => {
    const messages = [
      createMessage('old-user', 'user'),
      createMessage('old-answer', 'assistant'),
      createMessage('injected', 'user', { injectMessage: true }),
      createMessage('latest-user', 'user'),
      createMessage('latest-answer', 'assistant'),
    ];

    expect(selectLatestTimelineMessages(messages).map(({ id }) => id)).toEqual([
      'latest-user',
      'latest-answer',
    ]);
  });

  it('does not treat automated user-role messages as a new task start', () => {
    const messages = [
      createMessage('latest-user', 'user'),
      createMessage('answer', 'assistant'),
      createMessage('background-result', 'user', {
        backgroundAgentCompletion: true,
      }),
      createMessage('final-answer', 'assistant'),
    ];

    expect(selectLatestTimelineMessages(messages).map(({ id }) => id)).toEqual([
      'latest-user',
      'answer',
      'final-answer',
    ]);
  });

  it('returns no messages when there is no real user input', () => {
    const messages = [
      createMessage('reminder', 'user', { systemReminder: true }),
      createMessage('answer', 'assistant'),
    ];

    expect(selectLatestTimelineMessages(messages)).toEqual([]);
  });
});
