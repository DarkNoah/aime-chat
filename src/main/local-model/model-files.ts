import fs from 'fs';
import path from 'path';
import type { LocalModelItem } from '@/types/local-model';

export const DOWNLOAD_MARKER = '.aime-download.incomplete';

/** Check model metadata, nonempty weights, shard indexes and bundled codecs. */
export function isModelFullyDownloaded(
  modelPath: string,
  model?: LocalModelItem,
): boolean {
  const audio = model?.library === 'mlx' || model?.library === 'pytorch';
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
      } else if (audio && entry.name.endsWith('.safetensors.index.json')) {
        const index = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const shards = new Set(Object.values(index.weight_map || {}));
        if (!shards.size) incomplete = true;
        for (const shard of shards) {
          if (typeof shard !== 'string') {
            incomplete = true;
          } else {
            const shardPath = path.resolve(directory, shard);
            if (
              !shardPath.startsWith(`${path.resolve(directory)}${path.sep}`) ||
              !fs.statSync(shardPath).isFile() ||
              fs.statSync(shardPath).size === 0
            ) {
              incomplete = true;
            }
          }
        }
      } else if (
        audio &&
        directory === modelPath &&
        entry.name.endsWith('.safetensors') &&
        fs.statSync(fullPath).size > 0
      ) {
        hasWeights = true;
      } else if (
        !audio &&
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
    for (const file of model?.requiredFiles || []) {
      const info = fs.statSync(path.join(modelPath, file));
      if (!info.isFile() || info.size === 0) return false;
    }
    walk(modelPath);
    return hasWeights && !incomplete;
  } catch {
    return false;
  }
}

export function getLocalModelPath(root: string, type: string, modelId: string) {
  return path.join(
    root,
    type,
    ['tts', 'stt'].includes(type) ? modelId : modelId.split('/').pop(),
  );
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
