/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import type { Application, RequestHandler } from 'express';
import { BaseManager } from '../../BaseManager';
import { runCommand } from '../../utils/shell';
import {
  agentBrowser,
  bun,
  node,
  paddleOcr,
  qwenAudio,
  uv,
  getBunRuntime,
  getQwenAudioRuntime,
  getUVRuntime,
  runtimeManager,
} from '../runtime';

jest.mock('electron', () => ({ app: { getPath: () => '/test/user-data' } }));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: { rm: jest.fn() },
}));
jest.mock('..', () => ({ appManager: { toast: jest.fn() } }));
jest.mock('../../utils/shell', () => ({ runCommand: jest.fn() }));
jest.mock('../../utils', () => ({ getAssetPath: jest.fn() }));
jest.mock('../logger', () => ({ appLog: { write: jest.fn() } }));
jest.mock('../python-runtime-environment', () => ({
  inspectManagedPythonRuntime: jest.fn(async () => ({ installed: true })),
  ensureManagedPythonRuntime: jest.fn(async () => true),
}));
jest.mock('../../tools/code/python-package-cache', () => ({
  scheduleCodeExecutionPackageCacheWarmup: jest.fn(),
  getCodeExecutionPackageCachePaths: () => ({ uvCache: '/test/cache' }),
}));

const routes = new Map<string, RequestHandler>();
const apiApp = Object.fromEntries(
  ['get', 'post', 'put', 'patch', 'delete'].map((method) => [
    method,
    (route: string, handler: RequestHandler) =>
      routes.set(`${method} ${route}`, handler),
  ]),
) as unknown as Application;

async function invoke(method: string, route: string, input: object = {}) {
  const handler = routes.get(`${method} /api/runtime/${route}`);
  if (!handler) throw new Error(`Missing route: ${route}`);
  const res = { headersSent: false, json: jest.fn() };
  const next = jest.fn();
  await handler({ query: {}, ...input } as any, res as any, next);
  return { data: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

const root = '/test/user-data/.runtime';
const bunPath = path.join(
  root,
  'bin',
  process.platform === 'win32' ? 'bun.exe' : 'bun',
);
const files = new Set<string>();
const commandResult = (code = 0, stdout = '') => ({
  code,
  stdout,
  stderr: '',
  output: stdout,
  processSignal: undefined,
  error: undefined,
  timedOut: false,
  tempFilePath: undefined,
  pid: 1,
});

beforeAll(() => BaseManager.registerApiRoutes(apiApp));
beforeEach(() => {
  jest.clearAllMocks();
  files.clear();
  for (const state of [uv, bun, node, paddleOcr, qwenAudio, agentBrowser]) {
    Object.assign(state, {
      status: 'not_installed',
      installed: false,
      path: undefined,
      dir: undefined,
      version: undefined,
    });
  }
  uv.pythonRuntime = { installed: false };
  node.npmVersion = undefined;
  jest
    .mocked(fs.existsSync)
    .mockImplementation((file) => files.has(String(file)));
  jest.mocked(fs.promises.rm).mockImplementation(async (file) => {
    files.delete(String(file));
  });
  jest.mocked(runCommand).mockImplementation(async (command) => {
    const text = String(command);
    if (
      text.includes('https://bun.sh/install') ||
      text.includes('bun.sh/install.ps1')
    ) {
      files.add(bunPath);
      return commandResult();
    }
    if (text.includes('bun') && text.includes('--version')) {
      return files.has(bunPath)
        ? commandResult(0, '1.3.0\n')
        : commandResult(1);
    }
    return commandResult(1);
  });
});

it('registers the four routes and lists refreshed status, dependencies and capabilities', async () => {
  files.add(bunPath);
  const { data, error } = await invoke('get', 'list');
  expect(error).toBeUndefined();
  expect(data).toHaveLength(6);
  expect(data.find((entry) => entry.id === 'bun')).toMatchObject({
    installed: true,
    version: '1.3.0',
    path: bunPath,
    supportedActions: ['install', 'reinstall', 'uninstall'],
  });
  expect(data.find((entry) => entry.id === 'qwenAudio').dependencies).toEqual([
    'uv',
  ]);
  expect(data.find((entry) => entry.id === 'node').supportedActions).toEqual([
    'install',
  ]);
  expect(routes.size).toBe(4);
});

it.each(['false', '0'])(
  'does not run health probes for refresh=%s',
  async (refresh) => {
    expect(
      (await invoke('get', 'list', { query: { refresh } })).data,
    ).toHaveLength(6);
    expect(runCommand).not.toHaveBeenCalled();
  },
);

it.each(['yes', ['true'], { value: 'true' }])(
  'rejects invalid refresh %p',
  async (refresh) => {
    expect(
      (await invoke('get', 'list', { query: { refresh } })).error.status,
    ).toBe(400);
    expect(runCommand).not.toHaveBeenCalled();
  },
);

it.each([undefined, null, '', 'UV', 'toString', '__proto__', ['bun'], 1])(
  'rejects an invalid package %p before modifying anything',
  async (pkg) => {
    for (const action of ['install', 'reinstall', 'uninstall']) {
      expect(
        (await invoke('post', action, { body: { pkg } })).error.status,
      ).toBe(400);
    }
    expect(runCommand).not.toHaveBeenCalled();
    expect(fs.promises.rm).not.toHaveBeenCalled();
  },
);

it('installs, reinstalls and uninstalls through the registered API with verified results', async () => {
  const installed = await invoke('post', 'install', { body: { pkg: 'bun' } });
  expect(installed.error).toBeUndefined();
  expect(installed.data).toMatchObject({ installed: true, version: '1.3.0' });
  const reinstalled = await invoke('post', 'reinstall', {
    body: { pkg: 'bun' },
  });
  expect(reinstalled.error).toBeUndefined();
  expect(reinstalled.data.installed).toBe(true);
  expect(fs.promises.rm).toHaveBeenCalledWith(bunPath, { recursive: true });
  const installCalls = jest
    .mocked(runCommand)
    .mock.calls.filter(([cmd]) => String(cmd).includes('install'));
  expect(installCalls).toHaveLength(2);
  expect(jest.mocked(fs.promises.rm).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(runCommand).mock.invocationCallOrder[
      jest.mocked(runCommand).mock.calls.indexOf(installCalls[1])
    ],
  );
  const removed = await invoke('post', 'uninstall', { body: { pkg: 'bun' } });
  expect(removed.error).toBeUndefined();
  expect(removed.data).toMatchObject({
    installed: false,
    status: 'not_installed',
  });
  expect(files.has(bunPath)).toBe(false);
});

it('checks dependencies before a reinstall deletes the existing environment', async () => {
  files.add(path.join(root, 'qwen-audio-runtime'));
  const { error } = await invoke('post', 'reinstall', {
    body: { pkg: 'qwenAudio' },
  });
  expect(error).toMatchObject({ status: 409 });
  expect(error.message).toContain('uv');
  expect(fs.promises.rm).not.toHaveBeenCalled();
});

it.each(['reinstall', 'uninstall'])(
  'rejects %s of system Node without running commands',
  async (action) => {
    const { error } = await invoke('post', action, { body: { pkg: 'node' } });
    expect(error).toMatchObject({ status: 400 });
    expect(runCommand).not.toHaveBeenCalled();
    expect(fs.promises.rm).not.toHaveBeenCalled();
  },
);

it('blocks overlapping API/IPC mutations and exposes the active operation to status reads', async () => {
  files.add(bunPath);
  let finishRemoval: () => void;
  jest.mocked(fs.promises.rm).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRemoval = () => {
          files.delete(bunPath);
          resolve();
        };
      }),
  );
  const pending = runtimeManager.uninstallRuntime('bun');
  const conflict = await invoke('post', 'install', { body: { pkg: 'uv' } });
  expect(conflict.error.status).toBe(409);
  const listed = await invoke('get', 'list');
  expect(listed.data.find((entry) => entry.id === 'bun').operation).toBe(
    'uninstall',
  );
  expect(runCommand).not.toHaveBeenCalled();
  finishRemoval();
  await pending;
  expect(
    (await invoke('post', 'install', { body: { pkg: 'bun' } })).error,
  ).toBeUndefined();
});

it('propagates removal errors, keeps the existing state and releases the operation lock', async () => {
  files.add(path.join(root, 'paddleocr-runtime'));
  paddleOcr.installed = true;
  paddleOcr.status = 'installed';
  jest
    .mocked(fs.promises.rm)
    .mockRejectedValueOnce(new Error('permission denied'));
  expect(
    (await invoke('post', 'uninstall', { body: { pkg: 'paddleOcr' } })).error
      .message,
  ).toBe('permission denied');
  expect(paddleOcr.installed).toBe(true);
  expect(
    (await invoke('post', 'install', { body: { pkg: 'bun' } })).error,
  ).toBeUndefined();
});

it('reports a failed install instead of returning an apparently successful HTTP response', async () => {
  jest.mocked(runCommand).mockResolvedValue(commandResult(1));
  const { error, data } = await invoke('post', 'install', {
    body: { pkg: 'bun' },
  });
  expect(error).toMatchObject({ status: 500 });
  expect(data).toBeUndefined();
  expect(bun.status).toBe('not_installed');
});

it('does not accept the installed CLI when Agent Browser download fails', async () => {
  jest.mocked(runCommand).mockImplementation(async (command) => {
    if (command === 'node --version') return commandResult(0, 'v22.0.0');
    if (command === 'npm --version') return commandResult(0, '10.0.0');
    if (command === 'npm install -g agent-browser') return commandResult();
    if (command === 'agent-browser -V')
      return commandResult(0, 'agent-browser 1.0.0');
    return commandResult(1);
  });
  const { error } = await invoke('post', 'install', {
    body: { pkg: 'agentBrowser' },
  });
  expect(error).toMatchObject({ status: 500 });
  expect(agentBrowser.installed).toBe(false);
});

it('clears stale installed status when UV, Bun or QwenAudio health checks fail', async () => {
  for (const state of [uv, bun, qwenAudio]) {
    state.status = 'installed';
    state.installed = true;
  }
  files.add(
    path.join(root, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv'),
  );
  files.add(bunPath);
  files.add(path.join(root, 'qwen-audio-runtime'));
  jest.mocked(runCommand).mockResolvedValue(commandResult(1));
  expect((await getQwenAudioRuntime(true)).installed).toBe(false);
  expect((await getUVRuntime(true)).installed).toBe(false);
  expect((await getBunRuntime(true)).installed).toBe(false);
});

it('waits for an existing health probe before deleting runtime files', async () => {
  files.add(bunPath);
  let finishProbe: () => void;
  jest.mocked(runCommand).mockImplementationOnce(() => new Promise((resolve) => {
    finishProbe = () => resolve(commandResult(0, '1.3.0'));
  }));
  const listing = runtimeManager.listRuntimes(true);
  // UV inspection finishes before the Bun probe starts.
  await Promise.resolve();
  const removing = runtimeManager.uninstallRuntime('bun');
  await Promise.resolve();
  expect(fs.promises.rm).not.toHaveBeenCalled();
  finishProbe();
  await listing;
  await removing;
  expect(files.has(bunPath)).toBe(false);
});

it('uninstalls UV and managed Python without deleting dependent environments or models', async () => {
  const uvPath = path.join(root, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv');
  const pythonDir = path.join(root, 'python-runtime');
  const qwenDir = path.join(root, 'qwen-audio-runtime');
  const modelDir = '/test/user-data/models';
  for (const file of [uvPath, pythonDir, qwenDir, modelDir]) files.add(file);
  uv.status = qwenAudio.status = 'installed';
  uv.installed = qwenAudio.installed = true;
  const { data, error } = await invoke('post', 'uninstall', { body: { pkg: 'uv' } });
  expect(error).toBeUndefined();
  expect(data.installed).toBe(false);
  expect(files.has(uvPath)).toBe(false);
  expect(files.has(pythonDir)).toBe(false);
  expect(files.has(qwenDir)).toBe(true);
  expect(files.has(modelDir)).toBe(true);
  expect(qwenAudio.installed).toBe(false);
});

it('aborts reinstallation when npm fails to remove Agent Browser', async () => {
  jest.mocked(runCommand).mockImplementation(async (command) => {
    if (command === 'node --version') return commandResult(0, 'v22.0.0');
    if (command === 'npm --version') return commandResult(0, '10.0.0');
    return commandResult(1);
  });
  const { error } = await invoke('post', 'reinstall', { body: { pkg: 'agentBrowser' } });
  expect(error.message).toContain('Failed to uninstall');
  expect(runCommand).not.toHaveBeenCalledWith('npm install -g agent-browser', undefined);
});
