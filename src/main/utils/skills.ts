import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import { SkillInfo } from '@/types/skill';
import matter from 'gray-matter';
import { ToolType } from '@/types/tool';

export async function getSkills(workspace: string): Promise<SkillInfo[]> {
  const mds = await fg('**/SKILL.md', {
    cwd: workspace,
    absolute: true,
  });
  const skillList = [];
  for (const md of mds) {
    const skillPath = path.dirname(md);
    const skillMD = await fs.promises.readFile(md, { encoding: 'utf8' });
    const data = matter(skillMD);

    const relativePath = path.relative(workspace, skillPath);
    const skillId = relativePath.replaceAll('\\', ':').replaceAll('/', ':');
    const skill = {
      id: `${ToolType.SKILL}:${skillId}`,
      name: data.data.name,
      description: data.data.description,
      content: data.content,
      path: skillPath,
    } as SkillInfo;
    skillList.push(skill);
  }
  return skillList;
}
