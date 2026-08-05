import { isGitHubRepositoryUrl } from './git-clone';

describe('isGitHubRepositoryUrl', () => {
  it.each([
    'https://github.com/openai/codex',
    'https://github.com/openai/codex.git',
    'git@github.com:openai/codex.git',
    'ssh://git@github.com/openai/codex.git',
  ])('accepts a GitHub repository URL: %s', (repositoryUrl) => {
    expect(isGitHubRepositoryUrl(repositoryUrl)).toBe(true);
  });

  it.each([
    '',
    'openai/codex',
    'http://github.com/openai/codex',
    'https://gitlab.com/openai/codex',
    'https://github.com/openai/codex/tree/main',
    'https://user:token@github.com/openai/codex.git',
  ])('rejects a non-repository URL: %s', (repositoryUrl) => {
    expect(isGitHubRepositoryUrl(repositoryUrl)).toBe(false);
  });
});
