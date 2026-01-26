import { SkillInfo } from './skill';

export type Project = {
  id?: string;
  title?: string;
  path?: string;
  tag?: string;
  createdAt?: Date;
  skills?: SkillInfo[];
};

export enum ProjectEvent {
  ProjectCreated = 'project:project-created',
  ProjectUpdated = 'project:project-updated',
  ProjectDeleted = 'project:project-deleted',
  ThreadCreated = 'project:thread-created',
}
