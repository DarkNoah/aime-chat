import {
  buildTimelineEntry,
  timelineSummarySchema,
  type TimelineGenerationInput,
} from './timeline-entry';

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
});
