import fs from 'fs';
import path from 'path';
import { isBinaryFile } from 'isbinaryfile';

export type WorkspaceFileWriteResult = {
  size: number;
  modifiedAt: number;
};

export async function writeWorkspaceTextFile(
  workspace: string,
  filePath: string,
  content: string,
): Promise<WorkspaceFileWriteResult> {
  if (!workspace) {
    throw new Error('Workspace is required');
  }

  const [workspacePath, targetPath] = await Promise.all([
    fs.promises.realpath(workspace),
    fs.promises.realpath(filePath),
  ]);
  const relativePath = path.relative(workspacePath, targetPath);
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('File is outside the workspace');
  }

  const stat = await fs.promises.stat(targetPath);
  if (!stat.isFile()) {
    throw new Error('Not a file');
  }
  if (await isBinaryFile(targetPath)) {
    throw new Error('Binary files cannot be edited');
  }

  await fs.promises.writeFile(targetPath, content, 'utf-8');
  const savedStat = await fs.promises.stat(targetPath);
  return {
    size: savedStat.size,
    modifiedAt: savedStat.mtimeMs,
  };
}
