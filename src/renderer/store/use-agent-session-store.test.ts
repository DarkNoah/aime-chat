import type { AgentSessionUpdate } from '@/types/chat';
import { useAgentSessionStore } from './use-agent-session-store';

const createEvent = (
  sessionId: string,
  overrides: Partial<AgentSessionUpdate> = {},
): AgentSessionUpdate => ({
  event: 'started',
  sessionId,
  subagentThreadId: `subagent:${sessionId}`,
  description: `task-${sessionId}`,
  prompt: 'Inspect the project',
  subagentType: 'Explore',
  status: 'running',
  isExited: false,
  startTime: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
  ...overrides,
});

describe('useAgentSessionStore', () => {
  beforeEach(() => {
    useAgentSessionStore.setState({
      sessions: {},
      order: [],
      isPanelOpen: false,
      selectedSessionId: undefined,
    });
  });

  it('keeps every Agent message in arrival order', () => {
    const store = useAgentSessionStore.getState();
    store.upsertFromEvent(createEvent('agent-1'));
    store.upsertFromEvent(
      createEvent('agent-1', {
        event: 'message',
        message: {
          id: 'message-1',
          type: 'text',
          content: 'Inspecting files',
          createdAt: '2026-08-30T00:00:01.000Z',
        },
      }),
    );
    store.upsertFromEvent(
      createEvent('agent-1', {
        event: 'message',
        message: {
          id: 'message-2',
          type: 'tool-result',
          toolName: 'Read',
          content: 'file contents',
          createdAt: '2026-08-30T00:00:02.000Z',
        },
      }),
    );

    expect(
      useAgentSessionStore.getState().sessions['agent-1'].messages,
    ).toMatchObject([
      { id: 'message-1', content: 'Inspecting files' },
      { id: 'message-2', toolName: 'Read', content: 'file contents' },
    ]);
  });

  it('selects a running Agent when the panel opens', () => {
    const store = useAgentSessionStore.getState();
    store.upsertFromEvent(createEvent('running'));
    store.upsertFromEvent(
      createEvent('completed', {
        event: 'exited',
        status: 'completed',
        isExited: true,
      }),
    );
    useAgentSessionStore.setState({ selectedSessionId: 'completed' });
    useAgentSessionStore.getState().setPanelOpen(true);
    expect(useAgentSessionStore.getState().selectedSessionId).toBe('running');
  });

  it('preserves messages when a session exits', () => {
    const store = useAgentSessionStore.getState();
    store.upsertFromEvent(
      createEvent('agent-1', {
        event: 'message',
        message: {
          id: 'message-1',
          type: 'text',
          content: 'Done',
          createdAt: '2026-08-30T00:00:01.000Z',
        },
      }),
    );
    store.upsertFromEvent(
      createEvent('agent-1', {
        event: 'exited',
        status: 'completed',
        isExited: true,
        result: 'Done',
      }),
    );
    const session = useAgentSessionStore.getState().sessions['agent-1'];
    expect(session.messages).toHaveLength(1);
    expect(session.status).toBe('completed');
    expect(session.result).toBe('Done');
  });
});
