import { BaseManager } from '../BaseManager';
import { AgentChannel, ProjectChannel } from '@/types/ipc-channel';
import { channel } from '@/main/ipc/IpcController';
import { Agents } from '@/entities/agents';
import { Repository } from 'typeorm';
import { convertToInstructionContent } from '@/main/utils/convertToCoreMessages';
import { dbManager } from '@/main/db';
import { Projects } from '@/entities/projects';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '../app';
import { ProjectEvent } from '@/types/project';
import { StorageThreadType } from '@mastra/core/memory';
import mastraManager from '../mastra';
class ProjectManager extends BaseManager {
  projectsRepository: Repository<Projects>;

  async init() {
    this.projectsRepository = dbManager.dataSource.getRepository(Projects);
  }

  @channel(ProjectChannel.GetProject)
  async getProject(id: string): Promise<Projects> {
    return await this.projectsRepository.findOne({ where: { id } });
  }

  @channel(ProjectChannel.GetList)
  async getList({ page, size }: { page: number; size: number }) {
    const [projects, total] = await this.projectsRepository.findAndCount({
      skip: page * size,
      take: size,
      order: {
        createdAt: 'DESC',
      },
    });
    return {
      items: projects,
      total,
      page,
      size,
      hasMore: total > page * size,
    };
  }

  @channel(ProjectChannel.SaveProject)
  async saveProject(project: Projects) {
    let isNew = !project.id;
    if (!project.id) {
      project.id = nanoid();
    }
    const result = await this.projectsRepository.upsert(project, ['id']);
    const resultId = result.identifiers[0].id;
    const resultProject = await this.projectsRepository.findOne({
      where: { id: resultId },
    });
    if (isNew) {
      await appManager.sendEvent(ProjectEvent.ProjectCreated, resultProject);
    } else {
      await appManager.sendEvent(ProjectEvent.ProjectUpdated, resultProject);
    }

    return resultProject;
  }

  @channel(ProjectChannel.DeleteProject)
  async deleteProject(id: string) {
    const result = await this.projectsRepository.delete(id);
    await appManager.sendEvent(ProjectEvent.ProjectDeleted, id);
    return result;
  }

  @channel(ProjectChannel.CreateThread)
  public async createThread(options?: {
    projectId: string;
    tools?: string[];
    model?: string;
  }): Promise<StorageThreadType> {
    const storage = mastraManager.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const thread = await memoryStore.saveThread({
      thread: {
        id: nanoid(),
        title: 'New Thread',
        resourceId: `project:${options?.projectId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(options || {}),
        },
      },
    });
    await appManager.sendEvent(ProjectEvent.ThreadCreated, thread);
    return thread;
  }
}

export const projectManager = new ProjectManager();
