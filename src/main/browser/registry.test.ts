import { BrowserRegistry } from './registry';

describe('thread browser ownership', () => {
  it('keeps tab ownership, viewing and automation selection separate', () => {
    const registry = new BrowserRegistry<string>();
    const a1 = registry.add('A', 'target-a1', 'A first');
    const a2 = registry.add('A', 'target-a2', 'A second');
    registry.add('B', 'target-b1', 'B first');
    registry.select('A', a2.id);
    expect(registry.get('A').value).toBe('A first');
    expect(registry.get('B').value).toBe('B first');
    expect(() => registry.get('B', a2.id)).toThrow(/does not belong/);
    registry.select('A', a2.id, true);
    expect(registry.get('A').targetId).toBe('target-a2');
    registry.remove('A', a2.id);
    expect(registry.thread('A').selectedTabId).toBe(a1.id);
    expect(() => registry.get('A')).toThrow(/closed/);
    expect(registry.add('A', 'target-a3', 'A third').id).toBe('t3');
  });

  it('serializes one thread while another thread continues independently', async () => {
    const registry = new BrowserRegistry();
    const events: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = registry.run('A', async () => {
      events.push('A start');
      await held;
      events.push('A end');
    });
    const second = registry.run('A', async () => {
      events.push('A next');
    });
    await registry.run('B', async () => {
      events.push('B');
    });
    expect(events).toEqual(['A start', 'B']);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['A start', 'B', 'A end', 'A next']);
  });

  it('does not execute queued cancelled actions and recovers after failures', async () => {
    const registry = new BrowserRegistry();
    const controller = new AbortController();
    controller.abort();
    const action = jest.fn(async () => 'unexpected');
    await expect(registry.run('A', action, controller.signal)).rejects.toThrow(
      /cancelled/,
    );
    expect(action).not.toHaveBeenCalled();
    await expect(
      registry.run('A', async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    await expect(registry.run('A', async () => 'next')).resolves.toBe('next');
  });
});
