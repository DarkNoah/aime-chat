import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const isRepositoryPath = (pathname: string) => {
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2) return false;

  const [owner, repositoryWithSuffix] = parts;
  const repository = repositoryWithSuffix.replace(/\.git$/i, '');
  const isValidPart = (part: string) =>
    /^[a-z0-9_.-]+$/i.test(part) && part !== '.' && part !== '..';

  return isValidPart(owner) && isValidPart(repository);
};

export const isGitHubRepositoryUrl = (value: string) => {
  const repositoryUrl = value.trim();
  const scpStyleMatch = repositoryUrl.match(
    /^git@github\.com:([^/\s]+\/[^/\s]+)\/?$/i,
  );
  if (scpStyleMatch) return isRepositoryPath(scpStyleMatch[1]);

  try {
    const parsedUrl = new URL(repositoryUrl);
    if (parsedUrl.hostname.toLowerCase() !== 'github.com') return false;
    if (parsedUrl.search || parsedUrl.hash) return false;

    if (parsedUrl.protocol === 'https:') {
      if (parsedUrl.username || parsedUrl.password || parsedUrl.port)
        return false;
    } else if (parsedUrl.protocol === 'ssh:') {
      if (parsedUrl.username !== 'git' || parsedUrl.password) return false;
    } else {
      return false;
    }

    return isRepositoryPath(parsedUrl.pathname);
  } catch {
    return false;
  }
};

const assertEmptyCloneDestination = async (destination: string) => {
  try {
    const stats = await fs.promises.stat(destination);
    if (!stats.isDirectory()) {
      throw new Error('The project path must be a directory.');
    }

    const entries = await fs.promises.readdir(destination);
    if (entries.length > 0) {
      throw new Error(
        'The project directory must be empty before cloning a GitHub repository.',
      );
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;

    const parentDirectory = path.dirname(destination);
    const parentStats = await fs.promises
      .stat(parentDirectory)
      .catch(() => null);
    if (!parentStats?.isDirectory()) {
      throw new Error(
        'The parent directory for the project path does not exist.',
      );
    }
  }
};

export const cloneGitHubRepository = async (
  repositoryUrl: string,
  destination: string,
) => {
  const normalizedUrl = repositoryUrl.trim();
  if (!isGitHubRepositoryUrl(normalizedUrl)) {
    throw new Error('Please enter a valid GitHub repository URL.');
  }
  if (!destination?.trim()) {
    throw new Error('Please select a project directory before cloning.');
  }

  const resolvedDestination = path.resolve(destination);
  await assertEmptyCloneDestination(resolvedDestination);

  try {
    await execFileAsync(
      'git',
      ['clone', '--', normalizedUrl, resolvedDestination],
      {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        },
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      },
    );
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error('Git is not installed or is not available in PATH.');
    }

    const detail =
      typeof error?.stderr === 'string' ? error.stderr.trim() : error?.message;
    throw new Error(
      `Failed to clone the GitHub repository${detail ? `: ${detail}` : '.'}`,
    );
  }
};
