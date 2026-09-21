/** @jest-environment node */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { mutateWorkspaceEntry } from '../workspace-entry';

describe('workspace entry operations', () => {
  let directory: string;
  let workspace: string;
  const trash = jest.fn().mockResolvedValue(undefined);
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aime-entry-'));
    workspace = path.join(directory, 'workspace');
    await fs.mkdir(workspace);
    trash.mockClear();
  });
  afterEach(async () => fs.rm(directory, { recursive: true, force: true }));

  it('creates files and folders, renames them, and sends the selected entry to trash', async () => {
    const folder = await mutateWorkspaceEntry(
      { workspace, path: workspace, action: 'create-directory', name: 'docs' },
      trash,
    );
    const file = await mutateWorkspaceEntry(
      {
        workspace,
        path: folder.path,
        action: 'create-file',
        name: 'notes.txt',
      },
      trash,
    );
    expect(await fs.readFile(file.path, 'utf8')).toBe('');
    const renamed = await mutateWorkspaceEntry(
      { workspace, path: folder.path, action: 'rename', name: 'renamed' },
      trash,
    );
    expect(
      await fs.readFile(path.join(renamed.path, 'notes.txt'), 'utf8'),
    ).toBe('');
    await mutateWorkspaceEntry(
      { workspace, path: renamed.path, action: 'delete' },
      trash,
    );
    expect(trash).toHaveBeenCalledWith(renamed.path);
  });

  it('rejects duplicate names without replacing content', async () => {
    await fs.writeFile(path.join(workspace, 'a.txt'), 'keep');
    await fs.writeFile(path.join(workspace, 'b.txt'), 'other');
    await expect(
      mutateWorkspaceEntry(
        { workspace, path: workspace, action: 'create-file', name: 'a.txt' },
        trash,
      ),
    ).rejects.toThrow();
    await expect(
      mutateWorkspaceEntry(
        {
          workspace,
          path: path.join(workspace, 'b.txt'),
          action: 'rename',
          name: 'a.txt',
        },
        trash,
      ),
    ).rejects.toThrow('already exists');
    expect(await fs.readFile(path.join(workspace, 'a.txt'), 'utf8')).toBe(
      'keep',
    );
  });

  it.each(['../escape', '.', '..', 'a/b', 'a\\b', 'bad\0name', 'name.'])(
    'rejects invalid name %s',
    async (name) => {
      await expect(
        mutateWorkspaceEntry(
          { workspace, path: workspace, action: 'create-file', name },
          trash,
        ),
      ).rejects.toThrow('Invalid file name');
    },
  );

  it('rejects workspace root deletion and paths outside the workspace', async () => {
    await expect(
      mutateWorkspaceEntry(
        { workspace, path: workspace, action: 'delete' },
        trash,
      ),
    ).rejects.toThrow('outside');
    await expect(
      mutateWorkspaceEntry(
        { workspace, path: directory, action: 'create-file', name: 'x' },
        trash,
      ),
    ).rejects.toThrow('outside');
    expect(trash).not.toHaveBeenCalled();
  });

  it('rejects symlink escapes including creation through a linked directory', async () => {
    const link = path.join(workspace, 'external');
    await fs.symlink(directory, link, 'dir');
    await expect(
      mutateWorkspaceEntry(
        { workspace, path: link, action: 'create-file', name: 'x' },
        trash,
      ),
    ).rejects.toThrow('outside');
    await expect(
      mutateWorkspaceEntry({ workspace, path: link, action: 'delete' }, trash),
    ).rejects.toThrow('outside');
    expect(trash).not.toHaveBeenCalled();
  });
});
