import { resolveCronRunThread } from '../cron-thread';

describe('resolveCronRunThread', () => {
  const createThread = jest.fn();
  const getThread = jest.fn();
  const mastra = { createThread, getThread };
  const createOptions = {
    model: 'test-model',
    agentId: 'test-agent',
    tools: ['tool-a'],
    subAgents: ['agent-a'],
    resourceId: 'project:project-a',
    metadata: {
      cron: true,
      cronId: 'cron-a',
      cronName: 'Cron A',
      trigger: 'schedule' as const,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    createThread.mockResolvedValue({ id: 'new-thread' });
  });

  it('reuses the last cron thread when reuseThread is enabled and the thread exists', async () => {
    getThread.mockResolvedValue({ id: 'existing-thread' });

    const thread = await resolveCronRunThread(
      mastra,
      { reuseThread: true, lastRunChatId: 'existing-thread' },
      createOptions,
    );

    expect(thread.id).toBe('existing-thread');
    expect(getThread).toHaveBeenCalledWith('existing-thread', true);
    expect(createThread).not.toHaveBeenCalled();
  });

  it('creates a new thread when reuseThread is enabled but the last thread is missing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getThread.mockRejectedValue(new Error('not found'));

    const thread = await resolveCronRunThread(
      mastra,
      { reuseThread: true, lastRunChatId: 'missing-thread' },
      createOptions,
    );

    expect(thread.id).toBe('new-thread');
    expect(createThread).toHaveBeenCalledWith(createOptions);
    warnSpy.mockRestore();
  });

  it('creates a new thread when reuseThread is disabled', async () => {
    const thread = await resolveCronRunThread(
      mastra,
      { reuseThread: false, lastRunChatId: 'existing-thread' },
      createOptions,
    );

    expect(thread.id).toBe('new-thread');
    expect(getThread).not.toHaveBeenCalled();
    expect(createThread).toHaveBeenCalledWith(createOptions);
  });
});
