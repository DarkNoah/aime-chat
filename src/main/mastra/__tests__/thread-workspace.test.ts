/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { StorageThreadType } from '@mastra/core/memory';
import { deleteThreadWorkspace } from '../thread-workspace';

describe('deleteThreadWorkspace', () => {
  let userData: string;
  let workspace: string;
  let thread: StorageThreadType;

  beforeEach(async () => {
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-delete-thread-'));
    workspace = path.join(userData, 'threads', 'thread-1');
    await fs.mkdir(path.join(workspace, 'memory'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'memory', 'MEMORY.md'), 'notes');
    thread = {
      id: 'thread-1',
      resourceId: 'default',
      title: 'Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { workspace },
    };
  });

  afterEach(async () => {
    await fs.rm(userData, { recursive: true, force: true });
  });

  it('deletes the workspace and nested files, preserving other threads', async () => {
    const otherWorkspace = path.join(userData, 'threads', 'thread-2');
    await fs.mkdir(otherWorkspace);
    await fs.writeFile(path.join(otherWorkspace, 'keep.txt'), 'keep');

    await deleteThreadWorkspace(thread, userData);

    await expect(fs.stat(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.readFile(path.join(otherWorkspace, 'keep.txt'), 'utf8'),
    ).resolves.toBe('keep');
  });

  it('always preserves project workspaces', async () => {
    thread.resourceId = 'project:project-1';

    await deleteThreadWorkspace(thread, userData);

    await expect(
      fs.readFile(path.join(workspace, 'memory', 'MEMORY.md'), 'utf8'),
    ).resolves.toBe('notes');
  });

  it('accepts a missing folder or a thread without a workspace', async () => {
    await fs.rm(workspace, { recursive: true });
    await expect(
      deleteThreadWorkspace(thread, userData),
    ).resolves.toBeUndefined();
    thread.metadata = {};
    await expect(
      deleteThreadWorkspace(thread, userData),
    ).resolves.toBeUndefined();
  });

  it.each([
    'root',
    'other-thread',
    'relative',
    'invalid-metadata',
    'invalid-id',
  ])('rejects unsafe workspace ownership: %s', async (scenario) => {
    if (scenario === 'root') thread.metadata.workspace = userData;
    if (scenario === 'other-thread') {
      thread.metadata.workspace = path.join(userData, 'threads', 'thread-2');
    }
    if (scenario === 'relative') thread.metadata.workspace = 'threads/thread-1';
    if (scenario === 'invalid-metadata') thread.metadata.workspace = {};
    if (scenario === 'invalid-id') thread.id = '../thread-1';

    await expect(deleteThreadWorkspace(thread, userData)).rejects.toThrow(
      'outside this chat',
    );
    await expect(
      fs.readFile(path.join(workspace, 'memory', 'MEMORY.md'), 'utf8'),
    ).resolves.toBe('notes');
  });

  it.each(['folder', 'entry'])(
    'does not follow a symlink at the %s',
    async (location) => {
      const target = path.join(userData, 'external');
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, 'keep.txt'), 'keep');
      if (location === 'folder') {
        await fs.rm(workspace, { recursive: true });
        await fs.symlink(target, workspace, 'dir');
      } else {
        await fs.symlink(target, path.join(workspace, 'link'), 'dir');
      }

      await deleteThreadWorkspace(thread, userData);

      await expect(fs.lstat(workspace)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(
        fs.readFile(path.join(target, 'keep.txt'), 'utf8'),
      ).resolves.toBe('keep');
    },
  );
});
