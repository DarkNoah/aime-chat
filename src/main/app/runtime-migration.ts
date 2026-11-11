/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs';
import path from 'path';
import type { RuntimeMigrationVerification } from './runtime-migration-health';
import { normalizeRuntimeDirectory } from './runtime-directory';

export const MANAGED_RUNTIME_ENTRIES = [
  'bin/uv',
  'bin/uv.exe',
  'bin/uvx',
  'bin/uvx.exe',
  'bin/uvw.exe',
  'bin/bun',
  'bin/bun.exe',
  'bin/bunx',
  'bin/bunx.exe',
  'python',
  'python-runtime',
  'paddleocr-runtime',
  'qwen-audio-runtime',
  'code-execution',
  'agent-browser',
];

export interface RuntimeMigrationReceipt {
  source: string;
  destination: string;
  entries: string[];
  globalAgentBrowser?: string;
  verificationData?: RuntimeMigrationVerification;
}

export type RuntimeMigrationPhase =
  | 'downloading'
  | 'verifying'
  | 'cleaning'
  | 'restarting';

function within(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

async function exists(file: string) {
  try {
    await fs.promises.lstat(file);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

// Resolve existing parents too, so a missing target behind a symlink cannot
// alias or nest inside the source.
async function canonical(file: string): Promise<string> {
  if (await exists(file)) return fs.promises.realpath(file);
  return path.join(await canonical(path.dirname(file)), path.basename(file));
}

export async function validateMigrationDestination(
  source: string,
  input: string,
) {
  const destination = normalizeRuntimeDirectory(input);
  const [realSource, realDestination] = await Promise.all([
    canonical(source),
    canonical(destination),
  ]);
  if (
    within(realSource, realDestination) ||
    within(realDestination, realSource)
  ) {
    throw new Error('RUNTIME_MIGRATION_OVERLAP');
  }
  if (await exists(destination)) {
    const stat = await fs.promises.lstat(destination);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await fs.promises.readdir(destination)).length
    ) {
      throw new Error('RUNTIME_MIGRATION_TARGET_NOT_EMPTY');
    }
  }
  return destination;
}

export async function cleanupRuntimeSource(receipt: RuntimeMigrationReceipt) {
  // Receipts are persisted before cleanup. Validate them again on retry.
  if (
    within(receipt.source, receipt.destination) ||
    within(receipt.destination, receipt.source) ||
    receipt.entries.some((entry) => !MANAGED_RUNTIME_ENTRIES.includes(entry))
  ) {
    throw new Error('RUNTIME_MIGRATION_INVALID_RECEIPT');
  }
  for (const entry of receipt.entries) {
    const parent = path.dirname(path.join(receipt.source, entry));
    // Never follow a replaced parent symlink when removing files.
    if (
      (await exists(parent)) &&
      !within(receipt.source, await fs.promises.realpath(parent))
    ) {
      throw new Error('RUNTIME_MIGRATION_SOURCE_CHANGED');
    }
    await fs.promises.rm(path.join(receipt.source, entry), {
      recursive: true,
      force: true,
    });
  }
  for (const directory of [path.join(receipt.source, 'bin'), receipt.source]) {
    try {
      await fs.promises.rmdir(directory);
    } catch (error) {
      if (
        !['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(
          (error as { code?: string }).code || '',
        )
      )
        throw error;
    }
  }
}

export async function migrateRuntimeFiles(options: {
  source: string;
  destination: string;
  globalAgentBrowser?: string;
  verificationData?: RuntimeMigrationVerification;
  install: () => Promise<void>;
  verify: (destination: string) => Promise<void>;
  commit: (receipt: RuntimeMigrationReceipt) => Promise<void>;
  progress: (phase: RuntimeMigrationPhase) => void;
}) {
  const destination = await validateMigrationDestination(
    options.source,
    options.destination,
  );
  const source = await canonical(options.source);
  const receipt: RuntimeMigrationReceipt = {
    source,
    destination,
    entries: [],
    globalAgentBrowser: options.globalAgentBrowser,
    verificationData: options.verificationData,
  };
  const targetExisted = await exists(destination);
  await fs.promises.mkdir(destination, { recursive: true });
  // An exclusive marker prevents two migrations from owning the same target.
  const marker = path.join(destination, '.aime-runtime-migration');
  await fs.promises.writeFile(marker, source, { flag: 'wx' });
  let committed = false;
  try {
    // Capture only the cleanup inventory. No files or caches are read into the
    // new directory; install must populate it with fresh downloads.
    for (const entry of MANAGED_RUNTIME_ENTRIES) {
      const file = path.join(source, entry);
      if (!(await exists(file))) continue;
      if (
        !entry.startsWith('bin/') &&
        (await fs.promises.lstat(file)).isSymbolicLink()
      ) {
        throw new Error('RUNTIME_MIGRATION_SOURCE_CHANGED');
      }
      receipt.entries.push(entry);
    }
    options.progress('downloading');
    await options.install();
    options.progress('verifying');
    await options.verify(destination);
    await options.commit(receipt);
    committed = true;
    await fs.promises.unlink(marker);
    return receipt;
  } catch (error) {
    if (!committed) {
      // Only remove files owned by this attempt; the source is still untouched.
      await fs.promises.rm(destination, { recursive: true, force: true });
      if (targetExisted)
        await fs.promises.mkdir(destination, { recursive: true });
    }
    throw error;
  }
}
