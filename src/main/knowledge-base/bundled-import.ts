import fs from 'fs';
import path from 'path';
import { importKnowledgeBaseSQLite } from './import-sqlite';

const SQLITE_EXTENSIONS = new Set(['.sqlite', '.db']);

export const findBundledKnowledgeBaseSQLiteFiles = (directory: string) => {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const stat = fs.statSync(directory);
  if (!stat.isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(directory)
    .map((fileName) => path.join(directory, fileName))
    .filter((filePath) => {
      if (!SQLITE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        return false;
      }
      return fs.statSync(filePath).isFile();
    })
    .sort();
};

export const importBundledKnowledgeBases = async (directory: string) => {
  const { getDbPath } = await import('../utils');
  const files = findBundledKnowledgeBaseSQLiteFiles(directory);
  for (const filePath of files) {
    try {
      importKnowledgeBaseSQLite({
        appDbPath: getDbPath(),
        importDbPath: filePath,
        mode: 'append',
      });
      console.log('[knowledge-base] imported bundled knowledge base', filePath);
    } catch (error) {
      console.error(
        '[knowledge-base] import bundled knowledge base failed',
        filePath,
        error,
      );
    }
  }
};
