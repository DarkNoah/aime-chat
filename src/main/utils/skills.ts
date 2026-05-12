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
  // const skillJson = await fs.promises.readFile(path.join(workspace, 'skills.json'));
  const skillJson = await fs.promises.readFile(path.join(workspace, 'skills.json'), 'utf-8').catch(() => '[]');
  const skillJsonData = JSON.parse(skillJson.toString());
  const skillList = [];
  for (const skill of skillJsonData) {
    if (fs.existsSync(path.join(workspace, skill.name ?? skill.id, 'SKILL.md'))) {
      const skillMdPath = path.join(workspace, skill.name ?? skill.id, 'SKILL.md');
      const skillMd = await fs.promises.readFile(skillMdPath, 'utf-8');
      const skillData = matter(skillMd);
      skillList.push({
        id: skill.id,
        name: skillData.data.name,
        description: skillData.data.description,
        path: path.join(workspace, skill.name ?? skill.id),
        skillmd: skillData.content,
        source: skill.source,
      });
    }
  }
  return skillList;

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
