import { BaseManager } from '../BaseManager';
import { AgentChannel, ProjectChannel } from '@/types/ipc-channel';
import { channel } from '@/main/ipc/IpcController';
import { api } from '@/main/api/ApiController';
import { Agents } from '@/entities/agents';
import { ILike, Repository } from 'typeorm';
import { convertToInstructionContent } from '@/main/utils/convertToCoreMessages';
import { dbManager } from '@/main/db';
import { Projects } from '@/entities/projects';
import { nanoid } from '@/utils/nanoid';
import { appManager } from '../app';
import {
  Project,
  ProjectChatExportInput,
  ProjectChatExportResult,
  ProjectEvent,
} from '@/types/project';
import { StorageThreadType } from '@mastra/core/memory';
import mastraManager from '../mastra';
import fs from 'fs';
import path from 'path';
import { ToolType } from '@/types/tool';
import { getSkills } from '../utils/skills';
import { runCommand } from '../utils/shell';
import { DEFAULT_TITLE } from '@/types/chat';
import { app } from 'electron';
import { getDataPath } from '../utils';
import { cloneGitHubRepository } from './git-clone';
import { createProjectChatExport } from './chat-export';

class ProjectManager extends BaseManager {
  projectsRepository: Repository<Projects>;

  public DEFAULT_PROJECT_ID = 'aime-chat-workspace';

  async init() {
    this.projectsRepository = dbManager.dataSource.getRepository(Projects);
    let project = await this.getProject(this.DEFAULT_PROJECT_ID);
    if (!project) {
      project = new Projects(this.DEFAULT_PROJECT_ID);
      project.title = "workspace";
      project.path = getDataPath('workspaces', this.DEFAULT_PROJECT_ID);

      project.tag = "work";
      fs.mkdirSync(project.path, { recursive: true });
      project = await this.saveProject(project as Projects);
    }
  }

  @channel(ProjectChannel.GetProject)
  async getProject(id: string): Promise<Project> {
    const project: Project = await this.projectsRepository.findOne({
      where: { id },
    });
    if (!project) {
      return null;
    }
    project.skills = [];
    const skillsPath = path.join(project?.path, '.aime-chat', 'skills');
    if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) {
      project.skills = await getSkills(skillsPath);
    }
    const agentsMdPath = path.join(project?.path, `AGENTS.md`);
    if (fs.existsSync(agentsMdPath) && fs.statSync(agentsMdPath).isFile()) {
      const agentsMd = fs.readFileSync(agentsMdPath, 'utf-8');
      if (agentsMd) {
        project.agentsMd = agentsMd;
      }
    }


    return project as Project;
  }

  @api({
    method: 'get',
    path: '/api/projects/list',
    args: (req: any) => [
      {
        page: Number(req.query.page) || 0,
        size: Number(req.query.size) || 20,
        filter: (req.query.filter as string) || undefined,
      },
    ],
  })
  @channel(ProjectChannel.GetList)
  async getList({ page, size, filter }: { page: number; size: number, filter?: string }) {
    const [projects, total] = await this.projectsRepository.findAndCount({
      skip: page * size,
      take: size,
      order: {
        createdAt: 'DESC',
      },
      where: filter ? {
        title: ILike(`%${filter}%`),
      } : undefined,
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
  async saveProject(project: Projects & { githubUrl?: string }) {
    const { githubUrl, ...projectData } = project;
    const isNew = !projectData.id;
    if (!projectData.id) {
      projectData.id = nanoid();
    }
    if (isNew && githubUrl?.trim()) {
      await cloneGitHubRepository(githubUrl, projectData.path);
    }
    const result = await this.projectsRepository.upsert(projectData, ['id']);
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
        title: DEFAULT_TITLE,
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

  @channel(ProjectChannel.DeleteSkill)
  async deleteSkill(projectId: string, skillId: string) {
    const result = await this.getProject(projectId);
    const skills = await getSkills(
      path.join(result.path, '.aime-chat', 'skills'),
    );
    const skill = skills.find((x) => x.id === skillId);
    if (skill) {
      try {
        await fs.promises.rm(skill.path, { recursive: true });
        const skillJson = await fs.promises.readFile(path.join(result.path, '.aime-chat', 'skills', 'skills.json'));
        let skillJsonData = JSON.parse(skillJson.toString());
        skillJsonData = skillJsonData.filter((x: any) => x.id !== skill.id);
        if (skillJsonData.length === 0) {
          await fs.promises.rm(path.join(result.path, '.aime-chat', 'skills', 'skills.json'));
        } else {
          await fs.promises.writeFile(path.join(result.path, '.aime-chat', 'skills', 'skills.json'), JSON.stringify(skillJsonData, null, 2));
        }
      } catch (err) {
        appManager.toast('Failed to delete skill, ' + err.message, { type: 'error' });
      }
    }
    // return result;
  }


  @channel(ProjectChannel.OpenWith)
  async openWith(cwd: string, action: string) {
    if (action === 'vscode') {
      await runCommand('code .', {
        cwd: cwd,
      });
    }
    else if (action === 'cursor') {
      await runCommand(process.platform === 'win32' ? 'start cursor .' : 'open -a Cursor .', {
        cwd: cwd,
      });
    }
    else if (action === 'terminal') {
      await runCommand(process.platform === 'win32' ? 'start cmd.exe' : 'open -a Terminal .', {
        cwd: cwd,
      });
    }
  }

  @channel(ProjectChannel.ExportMessages)
  async exportMessages(
    input: ProjectChatExportInput,
  ): Promise<ProjectChatExportResult> {
    const project = await this.getProject(input?.projectId);
    if (!project) throw new Error('Project not found');
    if (!input?.targetPath || !path.isAbsolute(input.targetPath)) {
      throw new Error('A valid export path is required');
    }
    const allowedFormats = new Set(['markdown', 'json', 'xlsx', 'unsloth']);
    if (!allowedFormats.has(input.format)) {
      throw new Error('Unsupported export format');
    }

    const threadIds = Array.from(
      new Set((input.threadIds || []).filter((threadId) => threadId?.trim())),
    );
    if (threadIds.length === 0) {
      throw new Error('Select at least one chat thread');
    }

    const resourceId = `project:${project.id}`;
    const storage = mastraManager.mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const exportThreads = await Promise.all(
      threadIds.map(async (threadId) => {
        const thread = await memoryStore.getThreadById({ threadId });
        if (!thread || thread.resourceId !== resourceId) {
          throw new Error(`Thread ${threadId} does not belong to this project`);
        }
        const result = await mastraManager.getThreadMessages({
          threadId,
          resourceId,
          perPage: false,
          page: 0,
        });
        return {
          thread,
          messages: result.messages,
          rawMessages: result.mastraDBMessages,
        };
      }),
    );

    const artifact = createProjectChatExport(
      input.format,
      project,
      exportThreads,
    );
    if (input.format === 'unsloth' && artifact.messageCount === 0) {
      throw new Error(
        'The selected threads do not contain complete user/assistant training pairs',
      );
    }
    await fs.promises.writeFile(input.targetPath, artifact.content);
    return {
      filePath: input.targetPath,
      threadCount: exportThreads.length,
      messageCount: artifact.messageCount,
    };
  }
}
export const projectManager = new ProjectManager();
