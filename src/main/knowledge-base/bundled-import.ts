import fs from 'fs';
import path from 'path';

const SQLITE_EXTENSIONS = new Set(['.sqlite', '.db']);

export type BundledKnowledgeBaseConfig = {
  autoInstall?: boolean;
  description?: string;
};

/**
 * Reads the optional sidecar config next to a bundled knowledge base file,
 * e.g. `foo.sqlite.json` for `foo.sqlite`.
 */
export const readBundledKnowledgeBaseConfig = (
  filePath: string,
): BundledKnowledgeBaseConfig => {
  const configPath = `${filePath}.json`;
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.error(
      '[knowledge-base] read bundled knowledge base config failed',
      configPath,
      error,
    );
    return {};
  }
};

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