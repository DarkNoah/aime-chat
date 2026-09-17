import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_BROWSER_INSTANCE_ID = 'default_browser';
export const PROFILE_MARKER = '.aime-electron-profile.json';
const migrationName = '.electron-browser-migration-v1';

export const browserProfilePath = (userData: string) =>
  path.join(userData, 'instances', DEFAULT_BROWSER_INSTANCE_ID);

function exists(filename: string) {
  try {
    return fs.lstatSync(filename);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
}

function directory(filename: string) {
  const stat = exists(filename);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
    throw new Error(`Browser migration requires a real directory: ${filename}`);
}

function readRecord(filename: string) {
  const stat = exists(filename);
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Invalid browser migration record: ${filename}`);
  const record = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (record.version !== 1 || record.engine !== 'electron-chromium')
    throw new Error(`Unsupported browser migration record: ${filename}`);
  return record;
}

function writeRecord(filename: string, record: object) {
  const temporary = `${filename}.tmp`;
  if (exists(temporary)?.isSymbolicLink())
    throw new Error(`Invalid browser migration temporary file: ${temporary}`);
  fs.writeFileSync(temporary, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
}

/** Refuse to move a profile still owned by a running Chromium/Electron process. */
function assertUnlocked(root: string) {
  const lock = path.join(root, 'SingletonLock');
  if (!exists(lock)?.isSymbolicLink()) return;
  const pid = Number(fs.readlinkSync(lock).match(/-(\d+)$/)?.[1]);
  if (!pid)
    throw new Error(`Close the browser using ${root} before migration.`);
  if (pid === process.pid) return;
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as { code?: string }).code === 'ESRCH') return;
    throw new Error(`Close the browser using ${root} before migration.`);
  }
  throw new Error(`Close the browser using ${root} before migration.`);
}

/**
 * Run before creating any browser Session. Rename the current Electron profile
 * into the canonical location, then remove the obsolete external-browser data.
 * A journal and staged marker allow a restart at every rename boundary.
 * Only these fixed app-owned paths are touched; stored custom paths are ignored.
 */
export function migrateBrowserProfile(userData: string): string {
  if (!path.isAbsolute(userData)) throw new Error('userData must be absolute.');
  const parent = path.join(userData, 'instances');
  const partitions = path.join(userData, 'Partitions');
  const source = path.join(partitions, 'aime-browser');
  const target = browserProfilePath(userData);
  const stage = path.join(parent, `${migrationName}.stage`);
  const legacy = path.join(parent, `${migrationName}.legacy`);
  const journalFile = path.join(parent, `${migrationName}.json`);
  [userData, parent, partitions, source, target, stage, legacy].forEach(
    directory,
  );
  const complete = readRecord(path.join(target, PROFILE_MARKER));
  const journal = readRecord(journalFile);
  if (complete) {
    if (journal) {
      fs.rmSync(legacy, { recursive: true, force: true });
      fs.unlinkSync(journalFile);
    }
    return target;
  }
  assertUnlocked(userData);
  assertUnlocked(target);
  fs.mkdirSync(parent, { recursive: true });
  let plan = journal;
  if (!plan) {
    if (exists(stage) || exists(legacy))
      throw new Error('Unrecognized browser migration staging directory.');
    plan = {
      version: 1,
      engine: 'electron-chromium',
      hadSource: !!exists(source),
    };
    writeRecord(journalFile, plan);
  }
  if (!exists(stage)) {
    if (plan.hadSource) {
      if (!exists(source))
        throw new Error('Browser migration source is missing.');
      fs.renameSync(source, stage);
    } else fs.mkdirSync(stage);
  }
  // The marker travels with the source, so a completed rename can never be
  // mistaken for legacy data on the next launch.
  writeRecord(path.join(stage, PROFILE_MARKER), {
    version: 1,
    engine: 'electron-chromium',
  });
  if (exists(target)) {
    if (exists(legacy))
      throw new Error('Browser migration destination is ambiguous.');
    fs.renameSync(target, legacy);
  }
  fs.renameSync(stage, target);
  fs.rmSync(legacy, { recursive: true, force: true });
  fs.unlinkSync(journalFile);
  return target;
}
