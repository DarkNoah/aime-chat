import {
  findInstantSlashItem,
  findMatchingSkillSlashItem,
  type PromptInputSlashItem,
} from './prompt-input-slash-items';

const slashItems: PromptInputSlashItem[] = [
  {
    id: 'goal',
    label: 'goal',
    group: 'commands',
  },
  {
    id: 'compact',
    label: 'compact',
    group: 'commands',
    instant: true,
  },
  {
    id: 'skill:local:agent-browser',
    label: 'Agent Browser',
    group: 'skills',
  },
  {
    id: 'skill:local:agent-browser-pro',
    label: 'Agent Browser Pro',
    group: 'skills',
  },
];

describe('findMatchingSkillSlashItem', () => {
  it('identifies only commands configured as instant actions', () => {
    expect(findInstantSlashItem('compact', slashItems)?.id).toBe('compact');
    expect(findInstantSlashItem('goal', slashItems)).toBeUndefined();
    expect(
      findInstantSlashItem('skill:local:agent-browser', slashItems),
    ).toBeUndefined();
    expect(findInstantSlashItem('missing', slashItems)).toBeUndefined();
  });

  it('matches a complete skill slash command', () => {
    expect(
      findMatchingSkillSlashItem('/skill:local:agent-browser', slashItems),
    ).toMatchObject({
      id: 'skill:local:agent-browser',
      label: 'Agent Browser',
    });
  });

  it('keeps matching when the skill command is followed by a prompt', () => {
    expect(
      findMatchingSkillSlashItem(
        '/skill:local:agent-browser open example.com',
        slashItems,
      )?.id,
    ).toBe('skill:local:agent-browser');
  });

  it('does not turn partial skills or built-in commands into skill tags', () => {
    expect(
      findMatchingSkillSlashItem(
        '/skill:local:agent-browser-preview',
        slashItems,
      ),
    ).toBeUndefined();
    expect(findMatchingSkillSlashItem('/goal', slashItems)).toBeUndefined();
  });

  it('prefers the longest matching skill id', () => {
    expect(
      findMatchingSkillSlashItem(
        '/skill:local:agent-browser-pro do the work',
        slashItems,
      )?.id,
    ).toBe('skill:local:agent-browser-pro');
  });
});
