import { isPersonalityDisabled } from '../feature-flags';

describe('feature flags', () => {
  const originalDisablePersonality = process.env.DISABLE_PERSONALITY;

  afterEach(() => {
    if (originalDisablePersonality === undefined) {
      delete process.env.DISABLE_PERSONALITY;
    } else {
      process.env.DISABLE_PERSONALITY = originalDisablePersonality;
    }
  });

  it('disables personality only when DISABLE_PERSONALITY is true', () => {
    process.env.DISABLE_PERSONALITY = 'true';
    expect(isPersonalityDisabled()).toBe(true);

    process.env.DISABLE_PERSONALITY = 'false';
    expect(isPersonalityDisabled()).toBe(false);

    process.env.DISABLE_PERSONALITY = 'TRUE';
    expect(isPersonalityDisabled()).toBe(false);
  });
});
