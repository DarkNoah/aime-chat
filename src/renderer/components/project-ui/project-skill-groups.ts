import type { SkillInfo } from '@/types/skill';

export type ProjectSkillListItem =
  | { kind: 'skill'; skill: SkillInfo }
  | { kind: 'group'; key: string; name: string; skills: SkillInfo[] };

const SKILL_ROOTS = ['.agents/skills', 'skills', '.aime-chat/skills'];

const normalizePath = (value: string) =>
  value.replace(/\\/g, '/').replace(/\/+$/, '');

export function groupProjectSkills(
  skills: SkillInfo[],
  projectPath?: string,
): ProjectSkillListItem[] {
  const items: ProjectSkillListItem[] = [];
  const groups = new Map<
    string,
    Extract<ProjectSkillListItem, { kind: 'group' }>
  >();
  const normalizedProjectPath = projectPath && normalizePath(projectPath);

  for (const skill of skills) {
    const skillPath = skill.path && normalizePath(skill.path);
    let groupKey: string | undefined;
    let groupName: string | undefined;

    if (normalizedProjectPath && skillPath) {
      for (const root of SKILL_ROOTS) {
        const rootPath = `${normalizedProjectPath}/${root}/`;
        if (skillPath.startsWith(rootPath)) {
          const segments = skillPath
            .slice(rootPath.length)
            .split('/')
            .filter(Boolean);
          if (segments.length > 1) {
            [groupName] = segments;
            groupKey = `${root}/${groupName}`;
          }
          break;
        }
      }
    }

    if (!groupKey || !groupName) {
      items.push({ kind: 'skill', skill });
    } else {
      const group = groups.get(groupKey);
      if (group) {
        group.skills.push(skill);
      } else {
        const newGroup = {
          kind: 'group' as const,
          key: groupKey,
          name: groupName,
          skills: [skill],
        };
        groups.set(groupKey, newGroup);
        items.push(newGroup);
      }
    }
  }

  return items;
}
