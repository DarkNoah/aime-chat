import { resolveMemoryScope } from './memory-scope';

const context = (values: Record<string, string>) =>
  ({
    requestContext: { get: (key: string) => values[key] },
  }) as any;

describe('memory scope', () => {
  it('defaults project chats to their project and retains the source thread', async () => {
    await expect(
      resolveMemoryScope(
        undefined,
        context({ resourceId: 'project:p1', threadId: 't1' }),
      ),
    ).resolves.toEqual({ type: 'project', projectId: 'p1', threadId: 't1' });
  });
  it('uses global memory for ordinary chats and explicit global overrides', async () => {
    await expect(
      resolveMemoryScope(
        undefined,
        context({ resourceId: 'default', projectId: 'stale' }),
      ),
    ).resolves.toEqual({ type: 'global' });
    await expect(
      resolveMemoryScope('global', context({ resourceId: 'project:p1' })),
    ).resolves.toEqual({ type: 'global' });
  });
  it('supports trusted project context and agent context', async () => {
    await expect(
      resolveMemoryScope(undefined, context({ projectId: 'p2' })),
    ).resolves.toMatchObject({ type: 'project', projectId: 'p2' });
    await expect(
      resolveMemoryScope(undefined, {
        agent: { resourceId: 'project:p3', threadId: 't3' },
      } as any),
    ).resolves.toEqual({ type: 'project', projectId: 'p3', threadId: 't3' });
  });
  it('resolves a thread-only context from the persisted thread', async () => {
    const getThreadById = jest
      .fn()
      .mockResolvedValue({ resourceId: 'project:p4' });
    await expect(
      resolveMemoryScope(undefined, {
        ...context({ threadId: 't4' }),
        mastra: {
          getStorage: () => ({ getStore: async () => ({ getThreadById }) }),
        },
      }),
    ).resolves.toEqual({ type: 'project', projectId: 'p4', threadId: 't4' });
    expect(getThreadById).toHaveBeenCalledWith({ threadId: 't4' });
  });
  it('refuses explicit project scope outside a project instead of reading global data', async () => {
    await expect(
      resolveMemoryScope('project', context({ resourceId: 'default' })),
    ).rejects.toThrow('project chat');
    await expect(resolveMemoryScope(undefined)).resolves.toEqual({
      type: 'global',
    });
  });
});
