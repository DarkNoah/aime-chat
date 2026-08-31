import { SkillInfo } from './skill';

export type Project = {
  id?: string;
  title?: string;
  path?: string;
  tag?: string;
  createdAt?: Date;
  skills?: SkillInfo[];
  agentsMd?: string;
  defaultAgentId?: string;
  defaultModelId?: string;
  defaultTools?: string[];
  defaultSubAgents?: string[];
  timelineEnabled?: boolean;
};

export type ProjectTimelineEntry = {
  id: string;
  projectId: string;
  threadId: string;
  runId: string;
  summary: string;
  detailedSummary: string;
  deliverables: string[];
  startedAt: Date | string;
  endedAt: Date | string;
  durationMs: number;
  createdAt: Date | string;
};

export type ProjectTimelinePage = {
  items: ProjectTimelineEntry[];
  total: number;
  page: number;
  size: number;
  hasMore: boolean;
};

export type ProjectChatExportFormat = 'markdown' | 'json' | 'xlsx' | 'unsloth';

export type ProjectChatExportInput = {
  projectId: string;
  threadIds: string[];
  format: ProjectChatExportFormat;
  targetPath: string;
};

export type ProjectChatExportResult = {
  filePath: string;
  threadCount: number;
  messageCount: number;
};

export enum ProjectEvent {
  ProjectCreated = 'project:project-created',
  ProjectUpdated = 'project:project-updated',
  ProjectDeleted = 'project:project-deleted',
  ThreadCreated = 'project:thread-created',
  TimelineUpdated = 'project:timeline-updated',
}
