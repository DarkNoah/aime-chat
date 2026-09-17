/* eslint-disable import/no-cycle */
import { Agent } from '@mastra/core/agent';
import { Repository } from 'typeorm';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { providersManager } from '../providers';
import { appManager } from '../app';
import { channel } from '../ipc/IpcController';
import { api } from '../api/ApiController';
import type { ProjectTimelineEntry } from '@/types/project';
import { Projects } from '@/entities/projects';
import { ProjectChannel } from '@/types/ipc-channel';
import { ProjectEvent, ProjectTimelinePage } from '@/types/project';
import {
  buildTimelineEntry,
  selectLatestTimelineMessages,
  timelineSummarySchema,
  type TimelineGenerationInput,
} from './timeline-entry';
import { deleteProjectMemory } from '../knowledge-base/static-memory';
import {
  findTimelineMemory,
  listTimelineMemory,
  saveTimelineMemory,
} from './timeline-memory';
import { migrateLegacyTimeline } from './migrate-timeline';
import { normalizeTimelineMemoryItems } from './normalize-timeline-memory';

export class ProjectTimelineManager extends BaseManager {
  private projectsRepository: Repository<Projects>;

  private migration?: Promise<void>;

  private ensureMemoryReady(): Promise<void> {
    if (!this.migration) {
      this.migration = migrateLegacyTimeline(dbManager.dataSource)
        .then(() => normalizeTimelineMemoryItems(dbManager.dataSource))
        .catch((error) => {
          this.migration = undefined;
          throw error;
        });
    }
    return this.migration;
  }

  async init() {
    this.projectsRepository = dbManager.dataSource.getRepository(Projects);
    try {
      await this.ensureMemoryReady();
    } catch (error) {
      // Keep the application usable if a provider is temporarily unavailable.
      // Timeline access retries migration; legacy rows remain intact until success.
      console.error(
        '[timeline] Memory migration failed; will retry on access',
        error,
      );
    }
  }

  @api({
    method: 'get',
    path: '/api/projects/timeline',
    args: (req: any) => [
      {
        projectId: req.query.projectId as string,
        page: Number(req.query.page) || 0,
        size: Number(req.query.size) || 30,
      },
    ],
  })
  @channel(ProjectChannel.GetTimeline)
  async getTimeline({
    projectId,
    page = 0,
    size = 30,
  }: {
    projectId: string;
    page?: number;
    size?: number;
  }): Promise<ProjectTimelinePage> {
    await this.ensureMemoryReady();
    return listTimelineMemory(projectId, page, size);
  }

  @channel(ProjectChannel.SetTimelineEnabled)
  async setTimelineEnabled(projectId: string, enabled: boolean) {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) throw new Error('Project not found');

    project.timelineEnabled = enabled;
    const updatedProject = await this.projectsRepository.save(project);
    await appManager.sendEvent(ProjectEvent.ProjectUpdated, updatedProject);
    return updatedProject;
  }

  async isEnabled(projectId: string): Promise<boolean> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
      select: { id: true, timelineEnabled: true },
    });
    return Boolean(project?.timelineEnabled);
  }

  async generateTimelineEntry(
    input: TimelineGenerationInput,
  ): Promise<ProjectTimelineEntry | undefined> {
    await this.ensureMemoryReady();
    const project = await this.projectsRepository.findOne({
      where: { id: input.projectId },
    });
    if (!project?.timelineEnabled || input.messages.length === 0) {
      return undefined;
    }

    if (input.runId) {
      const existing = await findTimelineMemory(
        input.projectId,
        input.threadId,
        input.runId,
      );
      if (existing) return existing;
    }

    const model = await providersManager.getLanguageModel(input.modelId);
    const timelineAgent = new Agent({
      id: 'project-timeline-summary-agent',
      name: 'Project Timeline Summary Agent',
      model,
      instructions: `You summarize completed project-chat sessions for a private project timeline.

The supplied messages begin with the latest real user input. Summarize only this conversation segment and the substantive task completed from that input. Ignore routine greetings, acknowledgements, empty exchanges, and conversations with no meaningful task.

Be factual. Do not invent deliverables or claim checks that are not visible in the conversation. Keep the short summary extremely concise. Put implementation details, decisions, validation, unresolved limitations, and every explicit user choice that materially shaped the latest task in detailedSummary. Describe those choices in context, but never infer a choice the user did not make. Use an empty deliverables array when nothing concrete was delivered.`,
    });

    const history = selectLatestTimelineMessages(input.messages);
    if (history.length === 0) return undefined;

    const response = await timelineAgent.generate(history, {
      structuredOutput: {
        schema: timelineSummarySchema,
        jsonPromptInjection: true,
        errorStrategy: 'strict',
      },
    });
    if (!response.object) return undefined;
    const entry = buildTimelineEntry(input, response.object);
    if (!entry) return undefined;
    if (!(await this.isEnabled(input.projectId))) return undefined;

    const saved = await saveTimelineMemory(entry);
    await appManager.sendEvent(ProjectEvent.TimelineUpdated, {
      projectId: input.projectId,
      entry: saved,
    });
    return saved;
  }

  async deleteByThread(threadId: string): Promise<void> {
    await this.ensureMemoryReady();
    await deleteProjectMemory(undefined, threadId);
  }
}

export const projectTimelineManager = new ProjectTimelineManager();
