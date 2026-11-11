import fs from 'fs';
import path from 'path';

export type RuntimeMigrationRunner = (
  command: string,
  options?: {
    env?: Record<string, string>;
    timeout?: number;
    cwd?: string;
    usePowerShell?: boolean;
  },
) => Promise<string>;

export function runtimeVersion(output: string) {
  const version = output
    .trim()
    .match(
      /^(?:uv\s+|agent-browser\s+)?v?(\d+\.\d+\.\d+(?:-[\w.-]+)?)(?:\s|$)/i,
    )?.[1];
  if (!version)
    throw new Error('RUNTIME_MIGRATION_VERIFY_FAILED: Invalid runtime version');
  return version;
}

export async function downloadRuntimeBinary(
  name: 'uv' | 'bun',
  version: string,
  destination: string,
  run: RuntimeMigrationRunner,
) {
  if (runtimeVersion(version) !== version)
    throw new Error('RUNTIME_MIGRATION_VERIFY_FAILED: Invalid runtime version');
  const bin = path.join(destination, 'bin');
  await fs.promises.mkdir(bin, { recursive: true });
  const windows = process.platform === 'win32';
  if (name === 'uv') {
    const url = `https://astral.sh/uv/${version}/install.${windows ? 'ps1' : 'sh'}`;
    await run(
      windows
        ? `$ErrorActionPreference = 'Stop'; irm '${url}' | iex`
        : `set -o pipefail; curl -LsSf "${url}" | sh`,
      {
        env: { UV_UNMANAGED_INSTALL: bin, UV_NO_MODIFY_PATH: '1' },
        timeout: 10 * 60_000,
        usePowerShell: windows,
      },
    );
    return;
  }

  // Download the archive directly: the Bun installer also modifies shell
  // profiles, which must not point at an uncommitted migration destination.
  const platform = windows ? 'windows' : process.platform;
  if (
    !['windows', 'darwin', 'linux'].includes(platform) ||
    !['x64', 'arm64'].includes(process.arch)
  )
    throw new Error(
      'RUNTIME_MIGRATION_VERIFY_FAILED: Unsupported Bun platform',
    );
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const musl =
    platform === 'linux' && fs.existsSync('/etc/alpine-release') ? '-musl' : '';
  const baseline = arch === 'x64' ? '-baseline' : '';
  const target = `bun-${platform}-${arch}${musl}${baseline}`;
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/${target}.zip`;
  const staging = path.join(destination, '.bun-download');
  const archive = path.join(staging, 'bun.zip');
  await fs.promises.mkdir(staging);
  if (windows) {
    await run(
      `$ErrorActionPreference = 'Stop'; Invoke-WebRequest -Uri '${url}' -OutFile "${archive}"; Expand-Archive -LiteralPath "${archive}" -DestinationPath "${staging}"`,
      {
        usePowerShell: true,
        timeout: 10 * 60_000,
      },
    );
  } else {
    await run(
      `curl -fLsS "${url}" -o "${archive}" && unzip -q "${archive}" -d "${staging}"`,
      { timeout: 10 * 60_000 },
    );
  }
  const executable = windows ? 'bun.exe' : 'bun';
  const installed = path.join(bin, executable);
  await fs.promises.rename(path.join(staging, target, executable), installed);
  if (windows) await fs.promises.link(installed, path.join(bin, 'bunx.exe'));
  else {
    await fs.promises.chmod(installed, 0o755);
    await fs.promises.symlink('bun', path.join(bin, 'bunx'));
  }
  await fs.promises.rm(staging, { recursive: true });
}
