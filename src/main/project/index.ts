import { BaseManager } from '../BaseManager';
import { AgentChannel, ProjectChannel } from '@/types/ipc-channel';
import { channel } from '@/main/ipc/IpcController';
import { Agents } from '@/entities/agents';
import { Repository } from 'typeorm';
import { convertToInstructionContent } from '@/main/utils/convertToCoreMessages';
import { dbManager } from '@/main/db';
import { Projects } from '@/entities/projects';


class ProjectManager extends BaseManager {

  projectsRepository: Repository<Projects>;

  async init() {
    this.projectsRepository = dbManager.dataSource.getRepository(Projects);
  }


  @channel(ProjectChannel.GetProject)
  async getProject(id: string) {
    return await this.projectsRepository.findOne({ where: { id } });
  }

  @channel(ProjectChannel.SaveProject)
  async saveProject(project: Projects) {
    return await this.projectsRepository.upsert(project, ['id']);
  }

  @channel(ProjectChannel.DeleteProject)
  async deleteProject(id: string) {
    return await this.projectsRepository.delete(id);
  }
}

export const projectManager = new ProjectManager();
