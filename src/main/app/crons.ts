import { Repository } from 'typeorm';
import { Cron } from 'croner';
import { BaseManager } from '../BaseManager';
import { Crons } from '@/entities/crons';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { CronsChannel } from '@/types/ipc-channel';
import { ChatInput, ChatSubmitOptions } from '@/types/chat';
import mastraManager from '../mastra';
import { nanoid } from '@/utils/nanoid';

class CronsManager extends BaseManager {
  repository: Repository<Crons>;
  private scheduledJobs: Map<string, Cron> = new Map();

  public async init() {
    this.repository = dbManager.dataSource.getRepository(Crons);
    await this.restoreActiveJobs();
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
        console.log(`[Cron] Triggered: ${cronEntity.name} (${cronEntity.id})`);
        cronEntity.lastRunAt = new Date();
        await this.repository.save(cronEntity);
        const { model, agentId, tools, subAgents } = cronEntity.submitOptions;
        const body: ChatSubmitOptions = {
          model,
          agentId,
          tools,
          subAgents,
        };
        const thread = await mastraManager.createThread({
          model,
          agentId,
          tools,
          subAgents,
          resourceId: cronEntity.projectId ? `project:${cronEntity.projectId}` : undefined,
        })
        const inputMessage: ChatInput = {
          projectId: cronEntity.projectId,
          messages: [
            {
              id: nanoid(),
              role: 'user',
              parts: [{
                type: 'text',
                text: cronEntity.prompt,
              }],
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
        cronEntity.lastRunResult = result;
        cronEntity.lastRunEndAt = new Date();
        await this.repository.save(cronEntity);
      });
      this.scheduledJobs.set(cronEntity.id, job);
    } catch (err) {
      console.error(`[CronsManager] Failed to start job ${cronEntity.name}:`, err);
    }
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
    this.stopJob(id);
    await this.repository.delete(id);
  }
}

export const cronsManager = new CronsManager();
