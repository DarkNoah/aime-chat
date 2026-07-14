import path from 'path';
import fs from 'fs';
import { SkillInfo } from '@/types/skill';
import { readSkillPackageMetadata } from './skill-metadata';

export async function getSkills(workspace: string): Promise<SkillInfo[]> {
  // const skillJson = await fs.promises.readFile(path.join(workspace, 'skills.json'));
  const skillJson = await fs.promises.readFile(path.join(workspace, 'skills.json'), 'utf-8').catch(() => '[]');
  const skillJsonData = JSON.parse(skillJson.toString());
  const skillList = [];
  for (const skill of skillJsonData) {
    if (fs.existsSync(path.join(workspace, skill.name ?? skill.id, 'SKILL.md'))) {
      const skillMdPath = path.join(workspace, skill.name ?? skill.id, 'SKILL.md');
      const skillPath = path.dirname(skillMdPath);
      const metadata = await readSkillPackageMetadata(skillPath);
      skillList.push({
        ...metadata,
        id: skill.id,
        name: metadata.name || skill.name || skill.id,
        description: metadata.description || '',
        path: skillPath,
        skillmd: metadata.content,
        source: skill.source,
      });
    }
  }
  return skillList;
}
