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

class ProjectManager extends BaseManager {
  projectsRepository: Repository<Projects>;

  async init() {
    this.projectsRepository = dbManager.dataSource.getRepository(Projects);
  }

  @channel(ProjectChannel.GetProject)
  async getProject(id: string) {
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
    if (!project.id) {
      project.id = nanoid();
    }
    const result = await this.projectsRepository.upsert(project, ['id']);
    const resultId = result.identifiers[0].id;
    const resultProject = await this.projectsRepository.findOne({
      where: { id: resultId },
    });
    await appManager.sendEvent(ProjectEvent.ProjectCreated, resultProject);
    return resultProject;
  }

  @channel(ProjectChannel.DeleteProject)
  async deleteProject(id: string) {
    const result = await this.projectsRepository.delete(id);
    await appManager.sendEvent(ProjectEvent.ProjectDeleted, id);
    return result;
  }
}

export const projectManager = new ProjectManager();
