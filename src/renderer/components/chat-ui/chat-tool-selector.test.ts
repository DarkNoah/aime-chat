import { Tool, ToolType } from '@/types/tool';
import {
  groupSkillsByRepo,
  toggleSkillGroupSelection,
} from './chat-tool-selector';

const createSkill = (overrides: Partial<Tool>): Tool => ({
  id: 'skill:test',
  name: 'Test Skill',
  description: '',
  isActive: true,
  isToolkit: false,
  type: ToolType.SKILL,
  ...overrides,
});

describe('groupSkillsByRepo', () => {
  it('groups skills with the same repo and keeps ungrouped skills as single items', () => {
    const grouped = groupSkillsByRepo([
      createSkill({
        id: 'skill:one',
        name: 'One',
        repo: 'https://github.com/example/source-a',
      }),
      createSkill({
        id: 'skill:two',
        name: 'Two',
        repo: 'https://github.com/example/source-a',
      }),
      createSkill({
        id: 'skill:local',
        name: 'Local',
      }),
      createSkill({
        id: 'skill:three',
        name: 'Three',
        repo: 'source-b',
      }),
    ]);

    expect(grouped).toEqual([
      {
        id: 'https://github.com/example/source-a',
        name: 'example/source-a',
        skills: [
          expect.objectContaining({ id: 'skill:one' }),
          expect.objectContaining({ id: 'skill:two' }),
        ],
      },
      expect.objectContaining({ id: 'skill:local' }),
      {
        id: 'source-b',
        name: 'source-b',
        skills: [expect.objectContaining({ id: 'skill:three' })],
      },
    ]);
  });
});

describe('toggleSkillGroupSelection', () => {
  const group = {
    id: 'https://github.com/example/source-a',
    name: 'example/source-a',
    skills: [
      createSkill({ id: 'skill:one', name: 'One' }),
      createSkill({ id: 'skill:two', name: 'Two' }),
    ],
  };

  it('selects every skill in a group without changing other selected tools', () => {
    expect(toggleSkillGroupSelection(['build-in:Read'], group)).toEqual([
      'build-in:Read',
      'skill:one',
      'skill:two',
    ]);
  });

  it('selects missing skills when the group is partially selected', () => {
    expect(toggleSkillGroupSelection(['skill:one'], group)).toEqual([
      'skill:one',
      'skill:two',
    ]);
  });

  it('clears the group when every skill is already selected', () => {
    expect(
      toggleSkillGroupSelection(
        ['build-in:Read', 'skill:one', 'skill:two'],
        group,
      ),
    ).toEqual(['build-in:Read']);
  });
});
