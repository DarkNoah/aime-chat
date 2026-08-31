import { BashSessionUpdate } from '@/types/chat';
import { useBashSessionStore } from './use-bash-session-store';

const createEvent = (
  bashId: string,
  overrides: Partial<BashSessionUpdate> = {},
): BashSessionUpdate => ({
  event: 'started',
  bashId,
  command: `command-${bashId}`,
  isExited: false,
  startTime: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('useBashSessionStore', () => {
  beforeEach(() => {
    useBashSessionStore.setState({
      sessions: {},
      order: [],
      isPanelOpen: false,
      selectedSessionId: undefined,
    });
  });

  it('keeps the latest 1000 stdout and stderr lines', () => {
    const stdout = Array.from(
      { length: 1_005 },
      (_, index) => `out-${index + 1}`,
    ).join('\n');
    const stderr = `${Array.from(
      { length: 1_005 },
      (_, index) => `err-${index + 1}`,
    ).join('\n')}\n`;

    useBashSessionStore
      .getState()
      .upsertFromEvent(
        createEvent('session', { stdoutDelta: stdout, stderrDelta: stderr }),
      );

    const { session } = useBashSessionStore.getState().sessions;
    expect(session.stdout.split('\n')).toHaveLength(1_000);
    expect(session.stdout).toMatch(/^out-6\n/);
    expect(session.stdout).toMatch(/out-1005$/);
    expect(session.stderr.trimEnd().split('\n')).toHaveLength(1_000);
    expect(session.stderr).toMatch(/^err-6\n/);
    expect(session.stderr).toMatch(/err-1005\n$/);
  });

  it('selects a running session whenever the panel opens', () => {
    const store = useBashSessionStore.getState();
    store.upsertFromEvent(createEvent('running'));
    store.upsertFromEvent(
      createEvent('completed', {
        event: 'exited',
        isExited: true,
        exitCode: 0,
      }),
    );
    useBashSessionStore.setState({ selectedSessionId: 'completed' });

    useBashSessionStore.getState().setPanelOpen(true);

    expect(useBashSessionStore.getState().selectedSessionId).toBe('running');
  });

  it('falls back to the newest item when no session is running', () => {
    const store = useBashSessionStore.getState();
    store.upsertFromEvent(
      createEvent('older', { event: 'exited', isExited: true, exitCode: 0 }),
    );
    store.upsertFromEvent(
      createEvent('newer', { event: 'exited', isExited: true, exitCode: 1 }),
    );

    useBashSessionStore.getState().togglePanel();

    expect(useBashSessionStore.getState().selectedSessionId).toBe('newer');
  });
});
