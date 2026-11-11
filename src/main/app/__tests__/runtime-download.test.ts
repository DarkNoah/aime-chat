/** @jest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { downloadRuntimeBinary, runtimeVersion } from '../runtime-download';

const { platform, arch } = process;
let root: string;
beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'aime-download-'));
});
afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: platform });
  Object.defineProperty(process, 'arch', { value: arch });
  await fs.promises.rm(root, { recursive: true, force: true });
});

it.each(['darwin', 'win32'])(
  'downloads pinned UV without changing the user PATH on %s',
  async (targetPlatform) => {
    Object.defineProperty(process, 'platform', { value: targetPlatform });
    const run = jest.fn(async () => '');
    await downloadRuntimeBinary('uv', '0.10.7', root, run);
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining(
        `https://astral.sh/uv/0.10.7/install.${targetPlatform === 'win32' ? 'ps1' : 'sh'}`,
      ),
      expect.objectContaining({
        env: {
          UV_UNMANAGED_INSTALL: path.join(root, 'bin'),
          UV_NO_MODIFY_PATH: '1',
        },
        usePowerShell: targetPlatform === 'win32',
      }),
    );
  },
);

it.each(['darwin', 'win32'])(
  'extracts a fresh Bun archive and creates its alias on %s',
  async (targetPlatform) => {
    Object.defineProperty(process, 'platform', { value: targetPlatform });
    Object.defineProperty(process, 'arch', { value: 'arm64' });
    const name = `bun-${targetPlatform === 'win32' ? 'windows' : 'darwin'}-aarch64`;
    const exe = targetPlatform === 'win32' ? 'bun.exe' : 'bun';
    const run = jest.fn(async () => {
      const extracted = path.join(root, '.bun-download', name);
      await fs.promises.mkdir(extracted);
      await fs.promises.writeFile(path.join(extracted, exe), 'new binary');
      return '';
    });
    await downloadRuntimeBinary('bun', '1.3.3', root, run);
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining(`releases/download/bun-v1.3.3/${name}.zip`),
      expect.anything(),
    );
    expect(
      await fs.promises.readFile(path.join(root, 'bin', exe), 'utf8'),
    ).toBe('new binary');
    expect(
      await fs.promises.readFile(
        path.join(
          root,
          'bin',
          targetPlatform === 'win32' ? 'bunx.exe' : 'bunx',
        ),
        'utf8',
      ),
    ).toBe('new binary');
    expect(fs.existsSync(path.join(root, '.bun-download'))).toBe(false);
  },
);

it('rejects an unsafe version before invoking a shell', async () => {
  const run = jest.fn();
  await expect(
    downloadRuntimeBinary('uv', '0.10.7 ; touch unsafe', root, run),
  ).rejects.toThrow('Invalid runtime version');
  expect(run).not.toHaveBeenCalled();
  expect(runtimeVersion('uv 0.10.7 (build)')).toBe('0.10.7');
});
