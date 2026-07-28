import { hasHiddenPathSegment } from './skill-path';

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
