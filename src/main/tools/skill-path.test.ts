import path from 'path';
import {
  getSkillGroupDirName,
  hasHiddenPathSegment,
  isSamePathOrInside,
} from './skill-path';

describe('hasHiddenPathSegment', () => {
  it.each([
    '.github/skills/review',
    'skills/.internal/review',
    String.raw`skills\.internal\review`,
    '%2Egithub/skills/review',
    '.private',
  ])('detects a hidden folder in %s', (value) => {
    expect(hasHiddenPathSegment(value)).toBe(true);
  });

  it.each(['skills/review', 'packages/team/review', '../skills/review'])(
    'allows a visible skill path %s',
    (value) => {
      expect(hasHiddenPathSegment(value)).toBe(false);
    },
  );
});

describe('getSkillGroupDirName', () => {
  it.each(['office', ' office ', 'GMCC 技能'])(
    'uses %s as a single group directory',
    (group) => {
      expect(getSkillGroupDirName(group)).toBe(group.trim());
    },
  );

  it.each([
    undefined,
    null,
    '',
    '  ',
    '.',
    '..',
    '.hidden',
    '../escape',
    'a/b',
    String.raw`a\b`,
    'https://github.com/owner/repo',
  ])('rejects %s', (group) => {
    expect(getSkillGroupDirName(group)).toBeUndefined();
  });
});

describe('isSamePathOrInside', () => {
  const root = path.resolve('/data/skills');

  it.each([root, path.join(root, 'hub'), path.join(root, 'hub', 'skill1')])(
    'treats %s as inside the root',
    (childPath) => {
      expect(isSamePathOrInside(root, childPath)).toBe(true);
    },
  );

  it.each([
    path.resolve('/data'),
    path.resolve('/data/skills-other'),
    path.resolve('/data/other/skill1'),
  ])('treats %s as outside the root', (childPath) => {
    expect(isSamePathOrInside(root, childPath)).toBe(false);
  });

  it('treats a child directory named ..skill as inside the root', () => {
    expect(isSamePathOrInside(root, path.join(root, '..skill'))).toBe(true);
  });
});
