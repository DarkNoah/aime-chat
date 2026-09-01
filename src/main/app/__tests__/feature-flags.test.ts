import { getFeatureFlags, isPersonalityDisabled } from '../feature-flags';

const FLAG_VARIABLES = [
  'DISABLE_PERSONALITY',
  'DISABLE_PROJECTS',
  'DISABLE_MARKET',
  'DISABLE_CRONS',
  'DISABLE_KNOWLEDGE_BASE',
  'DISABLE_AGENTS',
] as const;

describe('feature flags', () => {
  const originalValues = new Map(
    FLAG_VARIABLES.map((variable) => [variable, process.env[variable]]),
  );

  beforeEach(() => {
    FLAG_VARIABLES.forEach((variable) => delete process.env[variable]);
  });

  afterEach(() => {
    FLAG_VARIABLES.forEach((variable) => {
      const original = originalValues.get(variable);
      if (original === undefined) {
        delete process.env[variable];
      } else {
        process.env[variable] = original;
      }
    });
  });

  it('disables personality only when DISABLE_PERSONALITY is true', () => {
    process.env.DISABLE_PERSONALITY = 'true';
    expect(isPersonalityDisabled()).toBe(true);

    process.env.DISABLE_PERSONALITY = 'false';
    expect(isPersonalityDisabled()).toBe(false);

    process.env.DISABLE_PERSONALITY = 'TRUE';
    expect(isPersonalityDisabled()).toBe(false);
  });

  it('leaves every feature enabled by default', () => {
    expect(getFeatureFlags()).toEqual({
      personalityDisabled: false,
      projectsDisabled: false,
      marketDisabled: false,
      cronsDisabled: false,
      knowledgeBaseDisabled: false,
      agentsDisabled: false,
    });
  });

  it('maps each environment variable to its own flag', () => {
    process.env.DISABLE_PROJECTS = 'true';
    process.env.DISABLE_MARKET = 'true';
    process.env.DISABLE_CRONS = 'true';
    process.env.DISABLE_KNOWLEDGE_BASE = 'true';
    process.env.DISABLE_AGENTS = 'true';

    expect(getFeatureFlags()).toEqual({
      personalityDisabled: false,
      projectsDisabled: true,
      marketDisabled: true,
      cronsDisabled: true,
      knowledgeBaseDisabled: true,
      agentsDisabled: true,
    });
  });

  it('ignores values other than the exact string true', () => {
    process.env.DISABLE_MARKET = '1';
    process.env.DISABLE_AGENTS = 'True';

    expect(getFeatureFlags().marketDisabled).toBe(false);
    expect(getFeatureFlags().agentsDisabled).toBe(false);
  });
});
