import { ToolType } from './tool';

export interface SkillInfo {
  id: `${ToolType.SKILL}:${string}`;
  name: string;
  description: string;
  path?: string;
  skillmd?: string;
}
