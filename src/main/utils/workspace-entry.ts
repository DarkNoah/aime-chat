import fs from 'fs/promises';
import path from 'path';
import type { WorkspaceEntryOperation } from '../../types/workspace-entry';

function assertWithin(root: string, target: string, allowRoot = false) {
  const relative = path.relative(root, target);
  if (
    (!relative && !allowRoot) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Path is outside the workspace');
  }
}

export async function mutateWorkspaceEntry(
  operation: WorkspaceEntryOperation,
  trashItem: (target: string) => Promise<void>,
): Promise<{ path: string }> {
  const { workspace, action, name } = operation;
  if (!workspace || !operation.path)
    throw new Error('Workspace and path are required');
  if (!['create-file', 'create-directory', 'rename', 'delete'].includes(action))
    throw new Error('Invalid operation');
  const creating = action === 'create-file' || action === 'create-directory';
  const root = await fs.realpath(workspace);
  const target = path.resolve(operation.path);
  // Check both the displayed path and its resolved target, including symlinks.
  assertWithin(path.resolve(workspace), target, creating);
  assertWithin(root, await fs.realpath(target), creating);
  if (action === 'delete') {
    await trashItem(target);
    return { path: target };
  }
  if (
    !name ||
    name.trim() !== name ||
    /[\\/<>:"|?*]/.test(name) ||
    Array.from(name).some((character) => character.charCodeAt(0) < 32) ||
    name === '.' ||
    name === '..' ||
    /[. ]$/.test(name)
  ) {
    throw new Error('Invalid file name');
  }
  const parent = creating ? target : path.dirname(target);
  assertWithin(root, await fs.realpath(parent), true);
  const destination = path.join(parent, name);
  if (action === 'create-file') {
    await fs.writeFile(destination, '', { flag: 'wx' });
  } else if (action === 'create-directory') {
    await fs.mkdir(destination);
  } else {
    // Never replace an existing file or directory.
    try {
      await fs.lstat(destination);
    } catch (error) {
      if ((error as Error & { code?: string }).code !== 'ENOENT') throw error;
      await fs.rename(target, destination);
      return { path: destination };
    }
    throw new Error('A file or folder with this name already exists');
  }
  return { path: destination };
}
