import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeWorkspaceTextFile } from '../workspace-file';

describe('writeWorkspaceTextFile', () => {
  let tempDirectory: string;
  let workspace: string;

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-file-editor-'));
    workspace = path.join(tempDirectory, 'workspace');
    fs.mkdirSync(workspace);
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  it('writes an existing text file inside the workspace', async () => {
    const filePath = path.join(workspace, 'notes.txt');
    fs.writeFileSync(filePath, 'before');

    const result = await writeWorkspaceTextFile(workspace, filePath, 'after');

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('after');
    expect(result.size).toBe(Buffer.byteLength('after'));
    expect(result.modifiedAt).toBeGreaterThan(0);
  });

  it('rejects a file outside the workspace', async () => {
    const outsideFile = path.join(tempDirectory, 'outside.txt');
    fs.writeFileSync(outsideFile, 'keep');

    await expect(
      writeWorkspaceTextFile(workspace, outsideFile, 'replace'),
    ).rejects.toThrow('File is outside the workspace');
    expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('keep');
  });

  it('rejects binary files', async () => {
    const binaryFile = path.join(workspace, 'image.bin');
    fs.writeFileSync(binaryFile, Buffer.from([0, 1, 2, 3, 4]));

    await expect(
      writeWorkspaceTextFile(workspace, binaryFile, 'replace'),
    ).rejects.toThrow('Binary files cannot be edited');
  });
});
