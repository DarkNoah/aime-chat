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
  cronId?: string;
  metadata?: Record<string, any>;
}

interface CronThreadCreateState {
  id: string;
  projectId?: string;
  submitOptions?: {
    model?: string;
    agentId?: string;
    tools?: string[];
    subAgents?: string[];
  };
}

interface CronRunStartState {
  lastRunAt?: Date;
  lastRunEndAt?: Date;
  lastRunResult?: any;
  lastRunChatId?: string;
  runHistory?: any[];
}

export function buildCronThreadCreateOptions(
  cron: CronThreadCreateState,
): CronThreadCreateOptions {
  const { model, agentId, tools, subAgents } = cron.submitOptions || {};

  return {
    model,
    agentId,
    tools,
    subAgents,
    resourceId: cron.projectId ? `project:${cron.projectId}` : undefined,
    cronId: cron.id,
  };
}

export function prepareCronRunStart(
  cron: CronRunStartState,
  startedAt: Date,
  runHistory: any[],
) {
  cron.lastRunAt = startedAt;
  cron.lastRunEndAt = undefined;
  cron.lastRunResult = undefined;
  cron.runHistory = runHistory;
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
