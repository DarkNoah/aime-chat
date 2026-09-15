import fs from 'fs/promises';
import path from 'path';
import type { StorageThreadType } from '@mastra/core/memory';

export async function deleteThreadWorkspace(
  thread: StorageThreadType,
  userData: string,
): Promise<void> {
  // Project threads share a workspace, which must outlive any single thread.
  if (thread.resourceId?.startsWith('project:')) return;

  const workspace = thread.metadata?.workspace;
  if (!workspace) return;

  const threadsRoot = path.resolve(userData, 'threads');
  const expectedPath = path.resolve(threadsRoot, thread.id);
  if (
    typeof workspace !== 'string' ||
    !path.isAbsolute(workspace) ||
    path.dirname(expectedPath) !== threadsRoot ||
    path.resolve(workspace) !== expectedPath
  ) {
    throw new Error('Cannot delete a workspace outside this chat’s folder.');
  }

  // rm removes symlinks themselves without following their targets.
  await fs.rm(expectedPath, { recursive: true, force: true });
}
