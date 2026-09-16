import fs from 'fs';
import path from 'path';

export const DOWNLOAD_MARKER = '.aime-download.incomplete';

/** Basic on-disk readiness for the ONNX models in the supported catalog. */
export function isModelFullyDownloaded(modelPath: string): boolean {
  let hasWeights = false;
  let incomplete = false;
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.endsWith('.incomplete') || entry.name.endsWith('.tmp')) {
        incomplete = true;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        entry.name.endsWith('.onnx') &&
        fs.statSync(fullPath).size > 0
      ) {
        hasWeights = true;
      }
    }
  };
  try {
    const config = fs.statSync(path.join(modelPath, 'config.json'));
    if (!config.isFile() || config.size === 0) return false;
    walk(modelPath);
    return hasWeights && !incomplete;
  } catch {
    return false;
  }
}

export function buildModelDownloadCommand(
  source: 'huggingface' | 'modelscope',
  repo: string,
  modelPath: string,
  isWindows: boolean,
) {
  const args =
    source === 'modelscope'
      ? [
          '--with',
          'setuptools<81',
          'modelscope',
          'download',
          '--model',
          repo,
          '--local_dir',
          modelPath,
        ]
      : ['hf', 'download', repo, '--local-dir', modelPath];
  if (isWindows) {
    const escape = (value: string) => `'${value.replace(/'/g, "''")}'`;
    return `& ${['./uvx.exe', ...args].map(escape).join(' ')}; exit $LASTEXITCODE`;
  }
  return ['./uvx', ...args]
    .map((value) => "'" + value.replace(/'/g, "'\"'\"'") + "'")
    .join(' ');
}
