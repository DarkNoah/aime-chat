/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  prepareRuntimeVerification,
  verifyMigratedRuntime,
} from '../runtime-migration-health';
import { downloadRuntimeBinary } from '../runtime-download';

jest.mock('electron', () => ({ app: {} }));
jest.mock('../runtime-download', () => ({
  ...jest.requireActual('../runtime-download'),
  downloadRuntimeBinary: jest.fn(async () => {}),
}));

let directory: string;
let source: string;
let destination: string;
const managed = 'python-runtime/.venv';
const snapshot = {
  prefix: '/old/python-runtime/.venv',
  base: '/external/python',
  executable: '/external/python/bin/python3.12',
  version: [3, 12, 12],
  packages: [['example', '1.2.3']],
};
const binary = (name: string) =>
  name + (process.platform === 'win32' ? '.exe' : '');
let run: jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'aime-fresh-migration-'),
  );
  source = path.join(directory, 'old');
  destination = path.join(directory, 'new');
  await fs.promises.mkdir(path.join(source, managed), { recursive: true });
  await fs.promises.writeFile(
    path.join(source, managed, 'pyvenv.cfg'),
    'version_info = 3.12.12',
  );
  await fs.promises.mkdir(path.join(source, 'bin'));
  await fs.promises.writeFile(path.join(source, 'bin', binary('uv')), 'old uv');
  await fs.promises.mkdir(path.join(source, 'code-execution/warmup-venv'), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(source, 'code-execution/warmup-venv/pyvenv.cfg'),
    'version_info = 3.10.18',
  );
  run = jest.fn(async (command: string) => {
    if (command.includes('warmup-venv')) throw new Error('broken warmup');
    if (command.includes('pip freeze')) return 'example==1.2.3\n';
    if (command.includes('--version')) return 'uv 0.10.7';
    return JSON.stringify(snapshot);
  });
});
afterEach(async () => {
  await fs.promises.rm(directory, { recursive: true, force: true });
});

it('redownloads the pinned interpreter and dependencies without old paths, caches or an offline fallback', async () => {
  const plan = await prepareRuntimeVerification(source, destination, run);
  expect(plan.verificationData.snapshots).toEqual([[managed, snapshot]]);
  expect(plan.verificationData.freshInstall).toBe(true);
  run.mockClear();
  await plan.install();
  expect(downloadRuntimeBinary).toHaveBeenCalledWith(
    'uv',
    '0.10.7',
    destination,
    run,
  );
  const { calls } = run.mock;
  expect(
    calls.some(([command]) =>
      command.includes('python install 3.12.12 --reinstall'),
    ),
  ).toBe(true);
  expect(
    calls.some(([command]) =>
      command.includes('--managed-python --no-python-downloads'),
    ),
  ).toBe(true);
  expect(
    calls.some(([command]) => command.includes('pip install --no-cache')),
  ).toBe(true);
  for (const [command, options] of calls) {
    expect(command).not.toContain(source);
    expect(command).not.toContain('--offline');
    expect(options.env).toMatchObject({
      UV_NO_CACHE: '1',
      UV_OFFLINE: '0',
      UV_PYTHON_INSTALL_DIR: path.join(destination, 'python'),
    });
    expect(options.env.UV_PYTHON_CACHE_DIR).toContain(destination);
  }
  expect(fs.existsSync(path.join(destination, 'code-execution'))).toBe(false);
  expect(
    await fs.promises.readFile(
      path.join(destination, 'python-runtime', 'pyproject.toml'),
      'utf8',
    ),
  ).toContain('package = false');
});

it('fails once on a download error without reading old caches or deleting the original', async () => {
  const plan = await prepareRuntimeVerification(source, destination, run);
  run.mockReset().mockRejectedValue(new Error('network unavailable'));
  await expect(plan.install()).rejects.toThrow('network unavailable');
  expect(run).toHaveBeenCalledTimes(1);
  expect(fs.existsSync(path.join(source, managed, 'pyvenv.cfg'))).toBe(true);
});

it('refuses local/editable requirements before installing anything', async () => {
  run.mockImplementation(async (command: string) =>
    command.includes('pip freeze')
      ? '-e /old/local-package'
      : JSON.stringify(snapshot),
  );
  await expect(
    prepareRuntimeVerification(source, destination, run),
  ).rejects.toThrow('LOCAL_PACKAGE_UNSUPPORTED');
  expect(downloadRuntimeBinary).not.toHaveBeenCalled();
});

it('does not probe a warmup-only environment or migrate its wheel cache', async () => {
  await fs.promises.rm(path.join(source, 'python-runtime'), {
    recursive: true,
  });
  await fs.promises.rm(path.join(source, 'bin'), { recursive: true });
  const plan = await prepareRuntimeVerification(source, destination, run);
  await fs.promises.mkdir(destination);
  await plan.install();
  expect(run).not.toHaveBeenCalled();
  expect(await fs.promises.readdir(destination)).toEqual([]);
});

it('still refuses migration when a real Python environment cannot start', async () => {
  run.mockRejectedValue(new Error("No module named 'encodings'"));
  await expect(
    prepareRuntimeVerification(source, destination, run),
  ).rejects.toThrow('encodings');
  expect(fs.existsSync(destination)).toBe(false);
});

it('installs Agent Browser with a new isolated npm cache', async () => {
  const browser = path.join(source, 'agent-browser/node_modules/agent-browser');
  await fs.promises.mkdir(path.join(browser, 'bin'), { recursive: true });
  await fs.promises.writeFile(
    path.join(browser, 'bin/agent-browser.js'),
    'old',
  );
  await fs.promises.writeFile(
    path.join(browser, 'package.json'),
    JSON.stringify({ version: '0.20.0' }),
  );
  const plan = await prepareRuntimeVerification(source, destination, run);
  await plan.install();
  expect(run).toHaveBeenCalledWith(
    expect.stringContaining('agent-browser@0.20.0'),
    expect.objectContaining({
      env: expect.objectContaining({
        npm_config_cache: path.join(destination, '.install-cache/npm'),
        npm_config_offline: 'false',
        npm_config_prefer_online: 'true',
      }),
    }),
  );
});

it('rejects a downloaded runtime with a different version', async () => {
  await expect(
    verifyMigratedRuntime(
      destination,
      source,
      {
        snapshots: [],
        binaries: ['uv'],
        binaryVersions: { uv: '0.10.7' },
        realSource: source,
      },
      async () => 'uv 0.11.0',
    ),
  ).rejects.toThrow('VERIFY_FAILED');
});

it('requires the new Python base to live inside the destination instead of reusing a shared interpreter', async () => {
  const venv = path.join(destination, managed);
  const external = path.join(directory, 'shared-python');
  await fs.promises.mkdir(venv, { recursive: true });
  await fs.promises.mkdir(path.join(destination, 'python'), {
    recursive: true,
  });
  await fs.promises.mkdir(external);
  const verification = {
    snapshots: [[managed, snapshot]] as [string, typeof snapshot][],
    binaries: [],
    realSource: source,
    freshInstall: true,
  };
  const after = {
    ...snapshot,
    prefix: venv,
    base: external,
    executable: path.join(external, 'bin/python'),
  };
  await expect(
    verifyMigratedRuntime(destination, source, verification, async () =>
      JSON.stringify(after),
    ),
  ).rejects.toThrow('VERIFY_FAILED');
  const freshBase = path.join(destination, 'python/cpython-3.12.12');
  await fs.promises.mkdir(freshBase);
  await expect(
    verifyMigratedRuntime(destination, source, verification, async () =>
      JSON.stringify({
        ...after,
        base: freshBase,
        executable: path.join(freshBase, 'bin/python'),
      }),
    ),
  ).resolves.toBeUndefined();
});
