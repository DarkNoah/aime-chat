import fs from 'fs';
import os from 'os';
import path from 'path';
import { findBundledKnowledgeBaseSQLiteFiles } from '../bundled-import';

describe('findBundledKnowledgeBaseSQLiteFiles', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-kb-bundled-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns sqlite and db files from an existing directory', () => {
    const sqlitePath = path.join(tempDir, 'a.sqlite');
    const dbPath = path.join(tempDir, 'b.db');
    const ignoredPath = path.join(tempDir, 'c.txt');
    fs.writeFileSync(sqlitePath, '');
    fs.writeFileSync(dbPath, '');
    fs.writeFileSync(ignoredPath, '');

    expect(findBundledKnowledgeBaseSQLiteFiles(tempDir)).toEqual([
      sqlitePath,
      dbPath,
    ]);
  });

  it('returns an empty list when the directory is missing', () => {
    expect(
      findBundledKnowledgeBaseSQLiteFiles(path.join(tempDir, 'missing')),
    ).toEqual([]);
  });
});
