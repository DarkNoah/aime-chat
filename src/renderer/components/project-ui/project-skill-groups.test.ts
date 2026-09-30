import type { SkillInfo } from '@/types/skill';
import { groupProjectSkills } from './project-skill-groups';

const skill = (id: string, skillPath: string): SkillInfo => ({
  id: `skill:local:${id}`,
  name: id,
  description: id,
  path: skillPath,
});

describe('groupProjectSkills', () => {
  it('shows a folder once while preserving its individual skills', () => {
    const skills = [
      skill('solo', '/workspace/.agents/skills/solo'),
      skill('review', '/workspace/.agents/skills/quality/review'),
      skill('audit', '/workspace/.agents/skills/quality/audit'),
      skill('other', '/workspace/skills/quality/other'),
    ];

    expect(groupProjectSkills(skills, '/workspace')).toEqual([
      { kind: 'skill', skill: skills[0] },
      {
        kind: 'group',
        key: '.agents/skills/quality',
        name: 'quality',
        skills: [skills[1], skills[2]],
      },
      {
        kind: 'group',
        key: 'skills/quality',
        name: 'quality',
        skills: [skills[3]],
      },
    ]);
  });

  it('handles Windows paths and leaves skills outside the project ungrouped', () => {
    const skills = [
      skill('nested', 'C:\\work\\.aime-chat\\skills\\group\\nested'),
      skill('external', 'C:\\elsewhere\\skills\\group\\external'),
    ];

    expect(groupProjectSkills(skills, 'C:\\work')).toEqual([
      {
        kind: 'group',
        key: '.aime-chat/skills/group',
        name: 'group',
        skills: [skills[0]],
      },
      { kind: 'skill', skill: skills[1] },
    ]);
  });
});
