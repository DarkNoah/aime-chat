import type { BackgroundAgentCompletion } from '@/main/tools/common/background-agent';
import { formatAgentCompletionMessage } from '../background-agent-completion';

const completion = (
  sessionId: string,
  patch: Partial<BackgroundAgentCompletion> = {},
): BackgroundAgentCompletion => ({
  threadId: 'thread-1',
  resourceId: 'default',
  sessionId,
  subagentThreadId: `subagent:${sessionId}`,
  description: `task ${sessionId}`,
  prompt: 'Inspect the project',
  subagentType: 'Explore',
  status: 'completed',
  result: 'Done',
  startTime: '2026-08-30T00:00:00.000Z',
  finishedAt: '2026-08-30T00:00:01.000Z',
  ...patch,
});

describe('formatAgentCompletionMessage', () => {
  it('includes successful and failed results in the injected message', () => {
    const text = formatAgentCompletionMessage([
      completion('agent-1'),
      completion('agent-2', {
        status: 'failed',
        result: undefined,
        errorMessage: 'Model unavailable',
      }),
    ]);
    expect(text).toContain('Background agents finished (2 agents).');
    expect(text).toContain('Agent ID: agent-1');
    expect(text).toContain('Result: Done');
    expect(text).toContain('Agent ID: agent-2');
    expect(text).toContain('Status: failed');
    expect(text).toContain('Error: Model unavailable');
  });
});
