import { formatSSHTarget, useSSHSessionStore } from './use-ssh-session-store';

describe('SSH session store', () => {
  beforeEach(() => {
    useSSHSessionStore.setState({
      sessions: {},
      order: [],
      isPanelOpen: false,
      selectedSessionId: undefined,
    });
  });

  it('formats config, IPv4, and IPv6 targets', () => {
    expect(formatSSHTarget({ type: 'config', name: 'production' })).toBe(
      'production',
    );
    expect(
      formatSSHTarget({
        type: 'direct',
        host: '192.0.2.20',
        port: 2222,
        username: 'root',
      }),
    ).toBe('root@192.0.2.20:2222');
    expect(formatSSHTarget({ type: 'direct', host: '::1' })).toBe('[::1]:22');
  });

  it('keeps only the current screen and clears exited sessions', () => {
    const store = useSSHSessionStore.getState();
    store.upsertFromEvent({
      event: 'started',
      connectionId: 'ssh-1',
      target: { type: 'config', name: 'production' },
      state: 'running',
      screen: 'password:',
      cursor: { row: 0, column: 9 },
      startTime: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:00.000Z',
    });
    useSSHSessionStore.getState().upsertFromEvent({
      event: 'output',
      connectionId: 'ssh-1',
      target: { type: 'config', name: 'production' },
      state: 'running',
      outputDelta: 'welcome\n',
      screen: 'welcome',
      cursor: { row: 0, column: 7 },
      startTime: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:01.000Z',
    });

    expect(useSSHSessionStore.getState().sessions['ssh-1']).toMatchObject({
      screen: 'welcome',
      state: 'running',
    });
    expect(useSSHSessionStore.getState().sessions['ssh-1']).not.toHaveProperty(
      'output',
    );

    useSSHSessionStore.getState().upsertFromEvent({
      event: 'exited',
      connectionId: 'ssh-1',
      target: { type: 'config', name: 'production' },
      state: 'exited',
      screen: 'welcome',
      cursor: { row: 0, column: 7 },
      exitCode: 0,
      startTime: '2026-07-14T00:00:00.000Z',
      updatedAt: '2026-07-14T00:00:02.000Z',
    });
    useSSHSessionStore.getState().clearExited();

    expect(useSSHSessionStore.getState().order).toEqual([]);
    expect(useSSHSessionStore.getState().sessions).toEqual({});
  });
});
