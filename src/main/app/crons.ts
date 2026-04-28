import { Repository } from 'typeorm';
import { Cron } from 'croner';
import { BaseManager } from '../BaseManager';
import { Crons, CronRunRecord } from '@/entities/crons';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import {
  CronsChannel,
  CULTIVATION_CRON_ID,
  isBuiltinCronId,
} from '@/types/ipc-channel';
import { ChatInput } from '@/types/chat';
import mastraManager from '../mastra';
import { nanoid } from '@/utils/nanoid';

const RUN_HISTORY_LIMIT = 50;

class CronsManager extends BaseManager {
  repository: Repository<Crons>;
  private scheduledJobs: Map<string, Cron> = new Map();
  private runningJobs: Set<string> = new Set();

  public async init() {
    this.repository = dbManager.dataSource.getRepository(Crons);
    await this.seedDefaultCrons();
    await this.restoreActiveJobs();
  }

  /**
   * Seed built-in cron jobs (only inserted once; user can edit/disable freely).
   * - Cultivation: daily memory maintenance (disabled by default; user opts in via UI).
   */
  private async seedDefaultCrons() {
    const existing = await this.repository.findOne({ where: { id: CULTIVATION_CRON_ID } });
    if (existing) return;

    const entity = new Crons(
      'Cultivation Daily',
      [
        'Run the daily cultivation pass: ingest yesterday\'s and today\'s chat history into the global memory wiki.',
        '',
        '1. MemoryRead({ target: "recent" }) — survey existing pages and the tail of log.md. Note thread ids already ingested in recent log entries.',
        '2. ChatHistoryList({ since: ingest_since, limit: 30 }) — pull the ingest_since value from the <cron-context> block above; this returns ONLY threads updated since the previous run, with cron threads automatically excluded. Then drop any thread ids already mentioned in recent log.md entries.',
        '3. For each new thread: ChatHistoryRead({ threadId, since: ingest_since, limit: 80 }). Extract durable facts: user preferences, habits, recurring workflows, important people / projects / tools, decisions, open todos.',
        '4. For each candidate fact: MemorySearch (and ChatHistorySearch if useful) to dedupe. Prefer updating an existing page over creating a new one.',
        '5. MemoryWrite topic pages: preferences.md, habits.md, people/<name>.md, projects/<name>.md, etc. Keep pages concise and cross-linked.',
        '6. MemoryWrite({ target: "index", mode: "replace" }) — refresh the catalog grouped by category.',
        '7. MemoryWrite({ target: "log", content: "ingested threads: <id1>, <id2>; updated pages: <names>" }) — append the daily summary. ALWAYS list the ingested thread ids so the next run can dedup.',
        '',
        'Be terse. End with a 1-2 sentence summary of what was added/updated.',
      ].join('\n'),
      '0 23 * * *',
    );
    entity.id = CULTIVATION_CRON_ID;
    entity.description = 'Daily auto-maintenance of the global memory wiki by the Cultivation agent.';
    entity.isActive = false;
    entity.submitOptions = {
      agentId: 'Cultivation',
    };

    try {
      await this.repository.save(entity);
      console.log('[CronsManager] Seeded default Cultivation cron (disabled).');
    } catch (err) {
      console.error('[CronsManager] Failed to seed default Cultivation cron', err);
    }
  }

  private async restoreActiveJobs() {
    const activeJobs = await this.repository.find({ where: { isActive: true } });
    for (const cronEntity of activeJobs) {
      this.startJob(cronEntity);
    }
    console.log(`[CronsManager] Restored ${activeJobs.length} active cron jobs`);
  }

  private startJob(cronEntity: Crons) {
    this.stopJob(cronEntity.id);
    try {
      const job = new Cron(cronEntity.cron, async () => {
        await this.executeCron(cronEntity.id, 'schedule');
      });
      this.scheduledJobs.set(cronEntity.id, job);
    } catch (err) {
      console.error(`[CronsManager] Failed to start job ${cronEntity.name}:`, err);
    }
  }

  private async executeCron(
    id: string,
    trigger: 'schedule' | 'manual',
  ): Promise<CronRunRecord> {
    const cronEntity = await this.repository.findOneByOrFail({ id });
    if (this.runningJobs.has(id)) {
      console.log(
        `[Cron] Skipped (previous run still in progress): ${cronEntity.name} (${id})`,
      );
      const last = (cronEntity.runHistory || []).slice(-1)[0];
      return (
        last || {
          startedAt: new Date().toISOString(),
          status: 'running',
          trigger,
        }
      );
    }

    this.runningJobs.add(id);
    const startedAt = new Date();
    const record: CronRunRecord = {
      startedAt: startedAt.toISOString(),
      status: 'running',
      trigger,
    };

    try {
      console.log(
        `[Cron] Triggered (${trigger}): ${cronEntity.name} (${id})`,
      );
      const previousRunAt = cronEntity.lastRunAt
        ? new Date(cronEntity.lastRunAt)
        : undefined;
      cronEntity.lastRunAt = startedAt;
      cronEntity.lastRunEndAt = undefined;
      cronEntity.lastRunResult = undefined;
      cronEntity.lastRunChatId = undefined;
      cronEntity.runHistory = this.appendRunHistory(cronEntity.runHistory, record);
      await this.repository.save(cronEntity);

      const { model, agentId, tools, subAgents } = cronEntity.submitOptions || {};
      const thread = await mastraManager.createThread({
        model,
        agentId,
        tools,
        subAgents,
        resourceId: cronEntity.projectId ? `project:${cronEntity.projectId}` : undefined,
        metadata: {
          cron: true,
          cronId: cronEntity.id,
          cronName: cronEntity.name,
          trigger,
        },
      });
      record.chatId = thread.id;
      cronEntity.lastRunChatId = thread.id;
      cronEntity.runHistory = this.replaceLastRun(cronEntity.runHistory, record);
      await this.repository.save(cronEntity);

      const sinceIso = previousRunAt
        ? previousRunAt.toISOString()
        : new Date(startedAt.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const cronContext = [
        '<cron-context>',
        `cron_id: ${cronEntity.id}`,
        `cron_name: ${cronEntity.name}`,
        `started_at: ${startedAt.toISOString()}`,
        `previous_run_at: ${previousRunAt?.toISOString() ?? '(none)'}`,
        `ingest_since: ${sinceIso}`,
        '',
        'Notes:',
        '- This conversation was started by a scheduled cron job, not by the user. Do not ingest this thread itself or any other thread whose metadata.cron is true.',
        '- When using ChatHistoryList / ChatHistorySearch, pass since=ingest_since so you only process new activity since the previous run.',
        '- ChatHistoryList already filters out cron-created threads by default; do not set includeCron unless explicitly asked.',
        '</cron-context>',
        '',
      ].join('\n');

      const inputMessage: ChatInput = {
        projectId: cronEntity.projectId,
        messages: [
          {
            id: nanoid(),
            role: 'user',
            parts: [
              {
                type: 'text',
                text: `${cronContext}${cronEntity.prompt}`,
              },
            ],
          },
        ],
        requireToolApproval: false,
        tools,
        subAgents,
        model,
        agentId,
        chatId: thread.id,
      };

      const result = await mastraManager.chat(undefined, inputMessage);
      const endedAt = new Date();
      cronEntity.lastRunResult = result;
      cronEntity.lastRunEndAt = endedAt;
      record.endedAt = endedAt.toISOString();
      record.status = 'success';
      cronEntity.runHistory = this.replaceLastRun(cronEntity.runHistory, record);
      await this.repository.save(cronEntity);
      return record;
    } catch (err: any) {
      const endedAt = new Date();
      record.endedAt = endedAt.toISOString();
      record.status = 'failed';
      record.error = err?.message || String(err);
      try {
        cronEntity.lastRunEndAt = endedAt;
        cronEntity.runHistory = this.replaceLastRun(cronEntity.runHistory, record);
        await this.repository.save(cronEntity);
      } catch (saveErr) {
        console.error('[CronsManager] Failed to persist failed run record', saveErr);
      }
      console.error(
        `[Cron] Failed: ${cronEntity.name} (${id})`,
        err,
      );
      return record;
    } finally {
      this.runningJobs.delete(id);
    }
  }

  private appendRunHistory(
    history: CronRunRecord[] | undefined,
    record: CronRunRecord,
  ): CronRunRecord[] {
    const next = [...(history || []), record];
    if (next.length > RUN_HISTORY_LIMIT) {
      return next.slice(next.length - RUN_HISTORY_LIMIT);
    }
    return next;
  }

  private replaceLastRun(
    history: CronRunRecord[] | undefined,
    record: CronRunRecord,
  ): CronRunRecord[] {
    const list = [...(history || [])];
    if (list.length === 0) return [record];
    list[list.length - 1] = record;
    return list;
  }

  private stopJob(id: string) {
    const job = this.scheduledJobs.get(id);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(id);
    }
  }

  @channel(CronsChannel.GetList)
  public async getList(): Promise<Crons[]> {
    return this.repository.find();
  }

  @channel(CronsChannel.Get)
  public async get(id: string): Promise<Crons> {
    return this.repository.findOneByOrFail({ id });
  }

  @channel(CronsChannel.Create)
  public async create(data: {
    name: string;
    prompt: string;
    cron: string;
    projectId?: string;
    description?: string;
    submitOptions?: any;
    isActive?: boolean;
  }): Promise<Crons> {
    const entity = new Crons(data.name, data.prompt, data.cron, data.projectId);
    if (data.description !== undefined) entity.description = data.description;
    if (data.submitOptions !== undefined) entity.submitOptions = data.submitOptions;
    if (data.isActive !== undefined) entity.isActive = data.isActive;
    const saved = await this.repository.save(entity);
    if (saved.isActive) {
      this.startJob(saved);
    }
    return saved;
  }

  @channel(CronsChannel.Update)
  public async update(
    id: string,
    data: {
      name?: string;
      prompt?: string;
      cron?: string;
      projectId?: string;
      description?: string;
      submitOptions?: any;
      isActive?: boolean;
    },
  ): Promise<Crons> {
    const entity = await this.repository.findOneByOrFail({ id });
    if (data.name !== undefined) entity.name = data.name;
    if (data.prompt !== undefined) entity.prompt = data.prompt;
    if (data.cron !== undefined) entity.cron = data.cron;
    if (data.projectId !== undefined) entity.projectId = data.projectId;
    if (data.description !== undefined) entity.description = data.description;
    if (data.submitOptions !== undefined) entity.submitOptions = data.submitOptions;
    if (data.isActive !== undefined) entity.isActive = data.isActive;
    const saved = await this.repository.save(entity);
    this.stopJob(id);
    if (saved.isActive) {
      this.startJob(saved);
    }
    return saved;
  }

  @channel(CronsChannel.Delete)
  public async delete(id: string): Promise<void> {
    if (isBuiltinCronId(id)) {
      throw new Error('Built-in cron job cannot be deleted.');
    }
    this.stopJob(id);
    await this.repository.delete(id);
  }

  @channel(CronsChannel.RunNow)
  public async runNow(id: string): Promise<{ started: boolean; alreadyRunning: boolean }> {
    if (this.runningJobs.has(id)) {
      return { started: false, alreadyRunning: true };
    }
    await this.repository.findOneByOrFail({ id });
    this.executeCron(id, 'manual').catch((err) => {
      console.error('[CronsManager] runNow failed', err);
    });
    return { started: true, alreadyRunning: false };
  }
}

export const cronsManager = new CronsManager();
