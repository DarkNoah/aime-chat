interface CronThreadResolver {
  createThread: (options: CronThreadCreateOptions) => Promise<{ id: string }>;
  getThread: (threadId: string, onlyThread?: boolean) => Promise<{ id: string }>;
}

interface CronThreadState {
  reuseThread?: boolean;
  lastRunChatId?: string;
}

export interface CronThreadCreateOptions {
  model?: string;
  agentId?: string;
  tools?: string[];
  subAgents?: string[];
  resourceId?: string;
  metadata?: Record<string, any>;
}

export async function resolveCronRunThread(
  mastra: CronThreadResolver,
  cron: CronThreadState,
  createOptions: CronThreadCreateOptions,
) {
  if (cron.reuseThread && cron.lastRunChatId) {
    try {
      return await mastra.getThread(cron.lastRunChatId, true);
    } catch (err) {
      console.warn(
        `[Cron] Failed to reuse last thread ${cron.lastRunChatId}; creating a new thread.`,
        err,
      );
    }
  }

  return mastra.createThread(createOptions);
}
