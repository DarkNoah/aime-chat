/** @jest-environment node */
/* eslint-disable no-await-in-loop */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  cleanupRuntimeSource,
  migrateRuntimeFiles,
  validateMigrationDestination,
} from '../runtime-migration';
import {
  acquireRuntimeUse,
  beginRuntimeMigration,
} from '../runtime-maintenance';

jest.mock('electron', () => ({ app: {} }));
let directory: string;
let source: string;
let destination: string;
beforeEach(async () => {
  directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'aime-migrate-'),
  );
  source = path.join(directory, 'old');
  destination = path.join(directory, '新 runtime');
  await fs.promises.mkdir(path.join(source, 'bin'), { recursive: true });
  await fs.promises.writeFile(path.join(source, 'bin', 'uv'), 'uv fixture');
});
afterEach(async () => {
  await fs.promises.rm(directory, { recursive: true, force: true });
});

it('downloads into an empty target, verifies before commit, and preserves Node and unrelated files on cleanup', async () => {
  await fs.promises.writeFile(path.join(source, 'bin', 'node'), 'node fixture');
  await fs.promises.writeFile(path.join(source, 'notes.txt'), 'keep');
  await fs.promises.mkdir(path.join(source, 'nvm'));
  const order: string[] = [];
  const receipt = await migrateRuntimeFiles({
    source,
    destination,
    progress: () => {},
    install: async () => {
      expect(await fs.promises.readdir(destination)).toEqual([
        '.aime-runtime-migration',
      ]);
      await fs.promises.mkdir(path.join(destination, 'bin'));
      await fs.promises.writeFile(
        path.join(destination, 'bin', 'uv'),
        'downloaded uv',
      );
    },
    verify: async (target) => {
      order.push('verify');
      expect(
        await fs.promises.readFile(path.join(target, 'bin', 'uv'), 'utf8'),
      ).toBe('downloaded uv');
      expect(fs.existsSync(path.join(target, 'bin', 'node'))).toBe(false);
      expect(fs.existsSync(path.join(source, 'bin', 'uv'))).toBe(true);
    },
    commit: async () => {
      order.push('commit');
    },
  });
  expect(order).toEqual(['verify', 'commit']);
  await cleanupRuntimeSource(receipt);
  expect(fs.existsSync(path.join(source, 'bin', 'uv'))).toBe(false);
  expect(fs.existsSync(path.join(source, 'bin', 'node'))).toBe(true);
  expect(fs.existsSync(path.join(source, 'nvm'))).toBe(true);
  expect(
    await fs.promises.readFile(path.join(source, 'notes.txt'), 'utf8'),
  ).toBe('keep');
  await cleanupRuntimeSource(receipt); // interrupted cleanup is idempotent
});

it.each(['install', 'verify', 'commit'])(
  'keeps the original and removes the partial download after %s fails',
  async (stage) => {
    const failure = async () => {
      throw new Error('test failure');
    };
    await expect(
      migrateRuntimeFiles({
        source,
        destination,
        progress: () => {},
        install: stage === 'install' ? failure : async () => {},
        verify: stage === 'verify' ? failure : async () => {},
        commit: stage === 'commit' ? failure : async () => {},
      }),
    ).rejects.toThrow('test failure');
    expect(fs.existsSync(path.join(source, 'bin', 'uv'))).toBe(true);
    expect(fs.existsSync(destination)).toBe(false);
  },
);

it('rejects occupied, nested, ancestor and symlink-aliased destinations without touching them', async () => {
  await fs.promises.mkdir(destination);
  await fs.promises.writeFile(path.join(destination, 'keep'), 'data');
  await expect(
    validateMigrationDestination(source, destination),
  ).rejects.toThrow('TARGET_NOT_EMPTY');
  for (const target of [source, path.join(source, 'nested'), directory]) {
    await expect(validateMigrationDestination(source, target)).rejects.toThrow(
      'OVERLAP',
    );
  }
  const alias = path.join(directory, 'alias');
  await fs.promises.symlink(source, alias, 'dir');
  await expect(
    validateMigrationDestination(source, path.join(alias, 'nested')),
  ).rejects.toThrow('OVERLAP');
  expect(
    await fs.promises.readFile(path.join(destination, 'keep'), 'utf8'),
  ).toBe('data');
});

it('never transfers old launchers, cached wheels or symlinks to the target', async () => {
  const oldEntries = ['python-runtime/.venv', 'code-execution/uv-cache'];
  for (const entry of oldEntries) {
    await fs.promises.mkdir(path.join(source, entry), { recursive: true });
    await fs.promises.writeFile(path.join(source, entry, 'sentinel'), 'old');
  }
  const copy = jest.spyOn(fs.promises, 'cp');
  const phases: string[] = [];
  await migrateRuntimeFiles({
    source,
    destination,
    progress: (phase) => phases.push(phase),
    install: async () => {
      for (const entry of oldEntries)
        expect(fs.existsSync(path.join(destination, entry))).toBe(false);
    },
    verify: async () => {},
    commit: async () => {},
  });
  expect(copy).not.toHaveBeenCalled();
  copy.mockRestore();
  expect(phases).toEqual(['downloading', 'verifying']);
  expect(fs.existsSync(path.join(source, oldEntries[0], 'sentinel'))).toBe(
    true,
  );
});

it('refuses unsafe cleanup receipts and symlink replacements', async () => {
  await expect(
    cleanupRuntimeSource({ source, destination, entries: ['../keep'] }),
  ).rejects.toThrow('INVALID_RECEIPT');
  await fs.promises.mkdir(destination);
  await fs.promises.writeFile(path.join(destination, 'uv'), 'keep');
  await fs.promises.rm(path.join(source, 'bin'), { recursive: true });
  await fs.promises.symlink(destination, path.join(source, 'bin'), 'dir');
  await expect(
    cleanupRuntimeSource({ source, destination, entries: ['bin/uv'] }),
  ).rejects.toThrow('SOURCE_CHANGED');
  expect(await fs.promises.readFile(path.join(destination, 'uv'), 'utf8')).toBe(
    'keep',
  );
});

it('blocks migration while commands run and blocks new commands during migration', () => {
  const release = acquireRuntimeUse();
  expect(beginRuntimeMigration).toThrow('BUSY');
  release();
  release();
  const end = beginRuntimeMigration();
  expect(acquireRuntimeUse).toThrow('BUSY');
  end();
  acquireRuntimeUse()();
});
