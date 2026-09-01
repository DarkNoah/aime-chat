import { BackgroundAgentManager } from './background-agent';

const session = {
  threadId: 'thread-1',
  resourceId: 'default',
  sessionId: 'agent-1',
  subagentThreadId: 'subagent:agent-1',
  description: 'Inspect project',
  prompt: 'Inspect every relevant file',
  subagentType: 'Explore',
};

describe('BackgroundAgentManager', () => {
  it('emits every message before the completion event', () => {
    const manager = new BackgroundAgentManager();
    const events: string[] = [];
    const completions: string[] = [];
    manager.onSessionUpdated((update) => {
      events.push(update.event);
    });
    manager.onSessionCompleted((completion) => {
      completions.push(completion.status);
    });

    manager.start(session);
    manager.appendMessage('agent-1', {
      id: 'message-1',
      type: 'text',
      content: 'First message',
      createdAt: '2026-08-31T00:00:01.000Z',
    });
    manager.appendMessage('agent-1', {
      id: 'message-2',
      type: 'tool-result',
      content: 'Tool output',
      toolName: 'Read',
      createdAt: '2026-08-31T00:00:02.000Z',
    });
    manager.complete('agent-1', {
      status: 'completed',
      result: 'Done',
    });

    expect(events).toEqual(['started', 'message', 'message', 'exited']);
    expect(completions).toEqual(['completed']);
  });

  it('aborts a running session through its managed signal', () => {
    const manager = new BackgroundAgentManager();
    const signal = manager.start(session);

    expect(manager.kill('agent-1')).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(manager.kill('missing')).toBe(false);
  });
});
