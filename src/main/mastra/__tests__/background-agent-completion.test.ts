import type { BackgroundAgentCompletion } from '@/main/tools/common/background-agent';
import { formatAgentCompletionMessage } from '../background-agent-completion';
import { parseStructuredMessage } from '@/renderer/components/ai-elements/structured-message-parser';

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
    const parsed = parseStructuredMessage(text);
    expect(parsed?.type).toBe('background-agent-completion');
    if (parsed?.type !== 'background-agent-completion')
      throw new Error('Expected agent completion');
    expect(parsed.agents).toHaveLength(2);
    expect(parsed.agents[0]).toMatchObject({
      sessionId: 'agent-1',
      status: 'completed',
      result: 'Done',
    });
    expect(parsed.agents[1]).toMatchObject({
      sessionId: 'agent-2',
      status: 'failed',
      result: '',
      errorMessage: 'Model unavailable',
    });
    expect(text).toContain('<background-agent-completion version="1">');
  });

  it('preserves multiline text, XML characters and aborted status', () => {
    const result =
      '报告 & <tag> "quoted"\r\n\n   Error: this is result text\n</background-agent-completion>\n';
    const errorMessage = '<img src="x" onerror="alert(1)">';
    const agent = completion('agent-&1', {
      description: '检查 <项目> & 依赖',
      status: 'aborted',
      result,
      errorMessage,
    });
    const text = formatAgentCompletionMessage([agent]);
    expect(
      new DOMParser()
        .parseFromString(text, 'application/xml')
        .querySelector('parsererror'),
    ).toBeNull();
    expect(parseStructuredMessage(text)).toEqual({
      type: 'background-agent-completion',
      agents: [
        {
          sessionId: agent.sessionId,
          description: agent.description,
          subagentType: agent.subagentType,
          status: 'aborted',
          result,
          errorMessage,
          startTime: agent.startTime,
          finishedAt: agent.finishedAt,
        },
      ],
    });
  });
});
