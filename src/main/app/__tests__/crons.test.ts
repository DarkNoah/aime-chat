import {
  buildCronThreadCreateOptions,
  prepareCronRunStart,
  resolveCronRunThread,
} from '../cron-thread';

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
    cronId: 'cron-a',
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

describe('buildCronThreadCreateOptions', () => {
  it('passes cronId directly when creating cron threads', () => {
    const options = buildCronThreadCreateOptions({
      id: 'cron-a',
      projectId: 'project-a',
      submitOptions: {
        model: 'test-model',
        agentId: 'test-agent',
        tools: ['tool-a'],
        subAgents: ['agent-a'],
      },
    });

    expect(options).toEqual({
      model: 'test-model',
      agentId: 'test-agent',
      tools: ['tool-a'],
      subAgents: ['agent-a'],
      resourceId: 'project:project-a',
      cronId: 'cron-a',
    });
  });
});

describe('prepareCronRunStart', () => {
  it('keeps lastRunChatId so reuseThread can reuse the previous thread', () => {
    const cron = {
      lastRunAt: new Date('2026-05-08T00:00:00.000Z'),
      lastRunEndAt: new Date('2026-05-08T00:01:00.000Z'),
      lastRunResult: { ok: true },
      lastRunChatId: 'previous-thread',
      runHistory: [],
    };
    const startedAt = new Date('2026-05-09T00:00:00.000Z');
    const record = {
      startedAt: startedAt.toISOString(),
      status: 'running' as const,
      trigger: 'manual' as const,
    };

    prepareCronRunStart(cron, startedAt, [record]);

    expect(cron.lastRunAt).toBe(startedAt);
    expect(cron.lastRunEndAt).toBeUndefined();
    expect(cron.lastRunResult).toBeUndefined();
    expect(cron.lastRunChatId).toBe('previous-thread');
    expect(cron.runHistory).toEqual([record]);
  });
});
