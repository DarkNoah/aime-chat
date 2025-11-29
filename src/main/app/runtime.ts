import fs from 'fs';
import { createShell, runCommand } from '../utils/shell';
import { app } from 'electron';
import path from 'path';
import { appManager } from '.';

export const uv = {
  status: 'not_installed' as 'installed' | 'not_installed' | 'installing',
  installed: false,
  path: undefined,
  dir: undefined,
  version: undefined,
};

export const node = {
  installed: undefined,
  path: undefined,
  dir: undefined,
  version: undefined,
};

export async function installUVRuntime() {
  const uvPath = path.join(app.getPath('userData'), '.runtime', 'bin', 'uv');
  if (fs.existsSync(uvPath)) return;
  if (uv.status === 'installing') {
    return;
  }
  uv.status = 'installing';
  let success = false;
  if (process.platform === 'darwin') {
    const result = await runCommand(
      `curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="${path.dirname(uvPath)}" UV_NO_MODIFY_PATH=1 sh`,
    );
    if (result.code === 0) success = true;
  } else if (process.platform === 'win32') {
    const result = await runCommand(
      `powershell -ExecutionPolicy ByPass -Command "$env:UV_INSTALL_DIR='${path.dirname(uvPath)}'; $env:UV_NO_MODEIFY=1; irm https://astral.sh/uv/install.ps1 | iex"`,
    );
    if (result.code === 0) success = true;
  }

  if (success) {
    appManager.toast('UV Runtime installed successfully', { type: 'success' });
    return await getUVRuntime(true);
  } else {
    appManager.toast('Failed to install UV Runtime', { type: 'error' });
    uv.status = 'not_installed';
  }
}
export async function unInstallUVRuntime() {
  const uvPath = path.join(app.getPath('userData'), '.runtime', 'bin', 'uv');
  const uvxPath = path.join(app.getPath('userData'), '.runtime', 'bin', 'uvx');
  if (fs.existsSync(uvPath)) {
    await fs.promises.rm(uvPath, { recursive: true });
  }
  if (fs.existsSync(uvxPath)) {
    await fs.promises.rm(uvxPath, { recursive: true });
  }
  await getUVRuntime(true);
}
export async function getUVRuntime(refresh = false) {
  if (uv.status === 'installing' && refresh == false) {
    return uv;
  }
  const uvPath = path.join(app.getPath('userData'), '.runtime', 'bin', 'uv');

  if (!fs.existsSync(uvPath)) {
    uv.status = 'not_installed';
    uv.installed = false;
    uv.path = undefined;
    uv.dir = undefined;
    uv.version = undefined;
    return uv;
  }
  if (uv.status === 'installed' && refresh == false) {
    return uv;
  }
  const result = await runCommand(`"${uvPath}" --version`, {
    timeout: 1000 * 5,
  });
  if (result.code === 0 && result.stdout.startsWith('uv ')) {
    uv.status = 'installed';
    uv.installed = true;
    uv.path = uvPath;
    uv.dir = path.dirname(uvPath);
    uv.version = result.stdout.split(' ')[1];
    return uv;
  }
}

export async function getNodeRuntime(refresh = false) {
  if (node.installed === undefined || refresh) {
    const command =
      process.platform == 'darwin' || process.platform == 'linux'
        ? 'which node'
        : 'where node';
    const result = await runCommand(command, { timeout: 1000 * 5 });
    if (result.code === 0 && fs.existsSync(result.output.trim())) {
      const versionResult = await runCommand(`node --version`, {
        timeout: 1000 * 5,
      });
      if (versionResult.code === 0 && versionResult.stdout.startsWith('v')) {
        node.version = versionResult.stdout.trim();
      }
      node.installed = true;
      node.path = result.output.trim();
      node.dir = path.dirname(result.output.trim());
      return node;
    }
  } else {
    return node;
  }
}
