/** @jest-environment node */
import {
  RuntimeManager,
  uv,
  bun,
  node,
  paddleOcr,
  qwenAudio,
  agentBrowser,
} from '../runtime';
import { getRuntimeDirectory, setRuntimeDirectory } from '../runtime-directory';
import {
  cleanupRuntimeSource,
  migrateRuntimeFiles,
} from '../runtime-migration';
import {
  prepareRuntimeVerification,
  verifyMigratedRuntime,
} from '../runtime-migration-health';
import { beginRuntimeMigration } from '../runtime-maintenance';
import { pausePackageCacheWarmup } from '../../tools/code/python-package-cache';

jest.mock('electron', () => ({
  app: { getPath: () => '/test', getAppPath: () => '/app' },
}));
jest.mock('..', () => ({ appManager: { toast: jest.fn() } }));
jest.mock('../../utils/shell', () => ({
  runCommand: jest.fn(async () => ({ code: 1, stdout: '', stderr: '' })),
}));
jest.mock('../../utils', () => ({ getAssetPath: jest.fn() }));
jest.mock('../logger', () => ({ appLog: { write: jest.fn() } }));
jest.mock('../python-runtime-environment', () => ({}));
jest.mock('../runtime-maintenance', () => ({
  beginRuntimeMigration: jest.fn(),
}));
jest.mock('../runtime-migration', () => ({
  migrateRuntimeFiles: jest.fn(),
  cleanupRuntimeSource: jest.fn(),
  validateMigrationDestination: jest.fn(async () => '/new'),
}));
jest.mock('../runtime-migration-health', () => ({
  prepareRuntimeVerification: jest.fn(),
  verifyMigratedRuntime: jest.fn(async () => {}),
}));
jest.mock('../../tools/code/python-package-cache', () => ({
  pausePackageCacheWarmup: jest.fn(),
  getCodeExecutionPackageCachePaths: jest.fn(),
  scheduleCodeExecutionPackageCacheWarmup: jest.fn(),
}));

const receipt = {
  source: '/old',
  destination: '/new',
  entries: ['python-runtime'],
  verificationData: { snapshots: [], binaries: [], realSource: '/old' },
};
let manager: RuntimeManager;
let order: string[];
const endMaintenance = jest.fn();
const resumeCache = jest.fn();
let callbacks: Parameters<RuntimeManager['migrateRuntimeDirectory']>[1];

beforeEach(() => {
  jest.clearAllMocks();
  order = [];
  manager = new RuntimeManager();
  setRuntimeDirectory('/old');
  for (const state of [uv, bun, node, paddleOcr, qwenAudio, agentBrowser])
    state.status = 'installed';
  node.path = '/system/node';
  uv.path = '/old/bin/uv';
  uv.pythonRuntime = {
    installed: true,
    pythonPath: '/old/python-runtime/.venv/bin/python',
  };
  jest.mocked(beginRuntimeMigration).mockReturnValue(endMaintenance);
  jest.mocked(pausePackageCacheWarmup).mockReturnValue(resumeCache);
  jest.mocked(prepareRuntimeVerification).mockResolvedValue({
    verificationData: receipt.verificationData,
    install: async () => {},
    verify: async () => {
      order.push('verify');
    },
  });
  jest.mocked(migrateRuntimeFiles).mockImplementation(async (options) => {
    await options.verify('/new');
    await options.commit(receipt);
    return receipt;
  });
  jest.mocked(cleanupRuntimeSource).mockImplementation(async () => {
    order.push('clean');
  });
  callbacks = {
    prepare: jest.fn(async () => {
      order.push('prepare');
    }),
    commit: jest.fn(async () => {
      order.push('commit');
    }),
    finish: jest.fn(async () => {
      order.push('finish');
    }),
    restart: jest.fn(() => {
      order.push('restart');
    }),
  };
});

it('verifies, persists, cleans and then restarts while keeping Node unchanged', async () => {
  await manager.migrateRuntimeDirectory('/new', callbacks);
  expect(order).toEqual([
    'prepare',
    'verify',
    'commit',
    'clean',
    'finish',
    'restart',
  ]);
  expect(getRuntimeDirectory()).toBe('/new');
  expect(node.path).toBe('/system/node');
  expect(uv.pythonRuntime?.pythonPath).toBe(
    '/new/python-runtime/.venv/bin/python',
  );
  expect(endMaintenance).not.toHaveBeenCalled();
  expect(manager.getRuntimeDirectoryInfo().migration?.phase).toBe('restarting');
});

it('does not clean or restart when download fails, and releases maintenance', async () => {
  jest
    .mocked(migrateRuntimeFiles)
    .mockRejectedValueOnce(new Error('download failed'));
  await expect(
    manager.migrateRuntimeDirectory('/new', callbacks),
  ).rejects.toThrow('download failed');
  expect(getRuntimeDirectory()).toBe('/old');
  expect(callbacks.commit).not.toHaveBeenCalled();
  expect(cleanupRuntimeSource).not.toHaveBeenCalled();
  expect(callbacks.restart).not.toHaveBeenCalled();
  expect(endMaintenance).toHaveBeenCalled();
  expect(resumeCache).toHaveBeenCalled();
});

it('retains the committed target and supports cleanup retry after app restart', async () => {
  jest
    .mocked(cleanupRuntimeSource)
    .mockRejectedValueOnce(new Error('file busy'));
  await expect(
    manager.migrateRuntimeDirectory('/new', callbacks),
  ).rejects.toThrow('CLEANUP_PENDING');
  expect(getRuntimeDirectory()).toBe('/new');
  expect(callbacks.restart).not.toHaveBeenCalled();
  expect(callbacks.finish).not.toHaveBeenCalled();
  expect(manager.getRuntimeDirectoryInfo().migration?.cleanupPending).toBe(
    true,
  );
  const restored = new RuntimeManager();
  restored.restoreMigration(receipt);
  await restored.migrateRuntimeDirectory('/new', callbacks);
  expect(verifyMigratedRuntime).toHaveBeenCalledWith(
    '/new',
    '/old',
    receipt.verificationData,
    expect.any(Function),
  );
  expect(migrateRuntimeFiles).toHaveBeenCalledTimes(1);
  expect(cleanupRuntimeSource).toHaveBeenCalledTimes(2);
  expect(callbacks.restart).toHaveBeenCalledTimes(1);
});

it('does not resume cleanup if the new environment no longer passes verification', async () => {
  setRuntimeDirectory('/new');
  manager.restoreMigration(receipt);
  jest
    .mocked(verifyMigratedRuntime)
    .mockRejectedValueOnce(new Error('missing new Python'));
  await expect(
    manager.migrateRuntimeDirectory('/new', callbacks),
  ).rejects.toThrow('CLEANUP_PENDING');
  expect(cleanupRuntimeSource).not.toHaveBeenCalled();
  expect(callbacks.restart).not.toHaveBeenCalled();
});

it('rejects concurrent installs while migration owns the directory', async () => {
  let finishPrepare!: () => void;
  callbacks.prepare = () =>
    new Promise<void>((resolve) => {
      finishPrepare = resolve;
    });
  const migrating = manager.migrateRuntimeDirectory('/new', callbacks);
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  await expect(manager.installRuntime('bun')).rejects.toThrow(
    'already in progress',
  );
  await expect(
    manager.saveRuntimeDirectory('/another', async () => {}),
  ).rejects.toThrow('BUSY');
  finishPrepare();
  await migrating;
});
