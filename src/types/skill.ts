import { ToolType } from './tool';
import type { SkillMetadata } from './skill-metadata';

export interface SkillInfo extends SkillMetadata {
  id: `${ToolType.SKILL}:${string}`;
  name: string;
  description: string;
  path?: string;
  skillmd?: string;
  source?: string;
  repo?: string;
}
