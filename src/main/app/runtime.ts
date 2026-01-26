import fs from 'fs';
import { createShell, runCommand } from '../utils/shell';
import { app } from 'electron';
import path from 'path';
import { appManager } from '.';
import { getAssetPath } from '../utils';
import { RuntimeInfo } from '@/types/app';

export const uv: RuntimeInfo['uv'] = {
  status: 'not_installed' as 'installed' | 'not_installed' | 'installing',
  installed: false,
  path: undefined,
  dir: undefined,
  version: undefined,
};

export const node: RuntimeInfo['node'] = {
  installed: undefined,
  path: undefined,
  dir: undefined,
  version: undefined,
};

export const paddleOcr: RuntimeInfo['paddleOcr'] = {
  status: 'not_installed' as 'installed' | 'not_installed' | 'installing',
  installed: false,
  path: undefined,
  dir: undefined,
  version: undefined,
};
export const bun: RuntimeInfo['bun'] = {
  status: 'not_installed' as 'installed' | 'not_installed' | 'installing',
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
  try {
    if (process.platform === 'darwin') {
      const result = await runCommand(
        `curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="${path.dirname(uvPath)}" UV_NO_MODIFY_PATH=1 sh`,
      );
      if (result.code === 0) success = true;
    } else if (process.platform === 'win32') {
      const result = await runCommand(
        [
          '-ExecutionPolicy',
          'ByPass',
          '-Command',
          'irm https://astral.sh/uv/install.ps1 | iex',
        ],

        {
          env: {
            UV_INSTALL_DIR: path.dirname(uvPath),
            UV_NO_MODIFY_PATH: '1',
          },
          usePowerShell: true,
        },
      );
      if (result.code === 0) success = true;
    }
  } catch {
    success = false;
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
  const isWindows = process.platform === 'win32';
  const uvPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'uv.exe' : 'uv',
  );
  const uvxPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'uvx.exe' : 'uvx',
  );
  const uvwPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'uvw.exe' : 'uvw',
  );
  if (fs.existsSync(uvPath)) {
    await fs.promises.rm(uvPath, { recursive: true });
  }
  if (fs.existsSync(uvxPath)) {
    await fs.promises.rm(uvxPath, { recursive: true });
  }
  if (fs.existsSync(uvwPath)) {
    await fs.promises.rm(uvwPath, { recursive: true });
  }
  await getUVRuntime(true);
}
export async function getUVRuntime(refresh = false) {
  if (uv.status === 'installing' && refresh == false) {
    return uv;
  }
  const isWindows = process.platform === 'win32';
  const uvPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'uv.exe' : 'uv',
  );

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
  const result = await runCommand(`"${path.basename(uvPath)}" --version`, {
    timeout: 1000 * 5,
    cwd: path.dirname(uvPath),
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

export async function getPaddleOcrRuntime(refresh = false) {
  if (paddleOcr.status === 'installing' && refresh == false) {
    return paddleOcr;
  }
  try {
    const uvRuntime = await getUVRuntime();
    if (uvRuntime.status !== 'installed') {
      paddleOcr.status = 'not_installed';
      paddleOcr.installed = false;
      paddleOcr.path = undefined;
      paddleOcr.dir = undefined;
      paddleOcr.version = undefined;
      return paddleOcr;
    }
    console.log(paddleOcr);

    const paddleOcrDir = path.join(
      app.getPath('userData'),
      'paddleocr-runtime',
    );
    if (!fs.existsSync(paddleOcrDir)) {
      paddleOcr.status = 'not_installed';
      paddleOcr.installed = false;
      paddleOcr.path = undefined;
      paddleOcr.dir = undefined;
      paddleOcr.version = undefined;
      return paddleOcr;
    }
    if (paddleOcr.status === 'installed' && refresh == false) {
      return paddleOcr;
    }
    const isWindows = process.platform === 'win32';
    const uvPreCommand = isWindows ? 'uv.exe' : './uv';

    const result2 = await runCommand(
      `${uvPreCommand}  run --project "${paddleOcrDir}" paddleocr -v`,
      {
        cwd: uvRuntime?.dir,
        env: {
          DISABLE_MODEL_SOURCE_CHECK: 'true',
        },
        timeout: 1000 * 30,
      },
    );
    if (result2.code === 0) {
      paddleOcr.status = 'installed';
      paddleOcr.installed = true;
      paddleOcr.path = paddleOcrDir;
      paddleOcr.dir = paddleOcrDir;
      paddleOcr.version = result2.stdout.trim().split(' ')[1];
      return paddleOcr;
    } else {
      paddleOcr.status = 'not_installed';
      paddleOcr.installed = false;
      paddleOcr.path = undefined;
      paddleOcr.dir = undefined;
      paddleOcr.version = undefined;
      return paddleOcr;
    }
  } catch {}
}

export async function installPaddleOcrRuntime() {
  const uvRuntime = await getUVRuntime();
  if (uvRuntime.status !== 'installed') {
    throw new Error('UV runtime is not installed');
  }
  const isWindows = process.platform === 'win32';
  const uvPreCommand = isWindows ? 'uv.exe' : './uv';
  const paddleOcrDir = path.join(app.getPath('userData'), 'paddleocr-runtime');
  paddleOcr.status = 'installing';
  if (fs.existsSync(paddleOcrDir)) {
    await fs.promises.rm(paddleOcrDir, { recursive: true });
  }
  fs.mkdirSync(paddleOcrDir, { recursive: true });

  const uv_source = `set UV_PYPI_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple`;

  let resultInit = await runCommand(
    `${uv_source} && ${uvPreCommand} init "${paddleOcrDir}" --python=3.10 && ${uvPreCommand} venv "${path.join(paddleOcrDir, '.venv')}" --python=3.10`,
    {
      cwd: uvRuntime?.dir,
    },
  );
  if (
    resultInit.code !== 0 ||
    !resultInit.output.includes('Initialized project')
  ) {
    // throw new Error('Failed to initialize PaddleOCR project');
    paddleOcr.status = 'not_installed';
    paddleOcr.installed = false;
    paddleOcr.path = undefined;
    paddleOcr.dir = undefined;
    paddleOcr.version = undefined;
    return paddleOcr;
  }

  const activateSourcePython = isWindows
    ? path.join(paddleOcrDir, '.venv', 'Scripts', 'python.exe')
    : path.join(paddleOcrDir, '.venv', 'bin', 'python');

  let hasGPU = false;
  const hasGPUResult = await runCommand(`nvidia-smi`, {
    cwd: uvRuntime?.dir,
  });
  if (hasGPUResult.code === 0 && hasGPUResult.stdout.includes('NVIDIA-SMI')) {
    hasGPU = true;
  }

  const result1 = await runCommand(
    `${uvPreCommand} --project "${paddleOcrDir}" --no-cache add paddleocr "paddlex[ocr]" paddlepaddle==3.2.2`,
    {
      cwd: uvRuntime?.dir,
      // usePowerShell: isWindows,
    },
  );
  if (result1.code !== 0) {
    paddleOcr.status = 'not_installed';
    paddleOcr.installed = false;
    paddleOcr.path = undefined;
    paddleOcr.dir = undefined;
    paddleOcr.version = undefined;
    return paddleOcr;
  }

  const result2 = await runCommand(
    `${uvPreCommand} run --project "${paddleOcrDir}" paddleocr -v`,
    {
      cwd: uvRuntime?.dir,
    },
  );

  const result3 = await runCommand(
    `${uvPreCommand} run --project "${paddleOcrDir}" paddleocr pp_structurev3 -i "${getAssetPath('runtime', 'paddleocr-runtime', 'test-image.png')}"`,
    {
      cwd: uvRuntime?.dir,
    },
  );
  if (result2.code === 0) {
    paddleOcr.status = 'installed';
    paddleOcr.installed = true;
    paddleOcr.path = paddleOcrDir;
    paddleOcr.dir = paddleOcrDir;
    paddleOcr.version = result2.stdout.trim().split(' ')[1];
    return paddleOcr;
  } else {
    paddleOcr.status = 'not_installed';
    paddleOcr.installed = false;
    paddleOcr.path = undefined;
    paddleOcr.dir = undefined;
    paddleOcr.version = undefined;
    return paddleOcr;
  }
}
export async function uninstallPaddleOcrRuntime() {
  const paddleOcrDir = path.join(app.getPath('userData'), 'paddleocr-runtime');
  if (fs.existsSync(paddleOcrDir)) {
    await fs.promises.rm(paddleOcrDir, { recursive: true });
  }
  paddleOcr.status = 'not_installed';
  paddleOcr.installed = false;
  paddleOcr.path = undefined;
  paddleOcr.dir = undefined;
  paddleOcr.version = undefined;
}

export async function getBunRuntime(refresh = false) {
  if (bun.status === 'installing' && refresh == false) {
    return bun;
  }
  const isWindows = process.platform === 'win32';
  const bunPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'bun.exe' : 'bun',
  );

  if (!fs.existsSync(bunPath)) {
    bun.status = 'not_installed';
    bun.installed = false;
    bun.path = undefined;
    bun.dir = undefined;
    bun.version = undefined;
    return bun;
  }
  if (bun.status === 'installed' && refresh == false) {
    return bun;
  }
  const result = await runCommand(`"${bunPath}" --version`, {
    timeout: 1000 * 5,
    // cwd: path.dirname(bunPath),
  });
  if (result.code === 0) {
    bun.status = 'installed';
    bun.installed = true;
    bun.path = bunPath;
    bun.dir = path.dirname(bunPath);
    bun.version = result.stdout.trim();
    return bun;
  }
}

export async function installBunRuntime() {
  const bunPath = path.join(app.getPath('userData'), '.runtime');
  if (fs.existsSync(path.join(bunPath, 'bin', 'bun'))) return;
  if (bun.status === 'installing') {
    return;
  }
  bun.status = 'installing';
  let success = false;
  try {
    fs.mkdirSync(bunPath, { recursive: true });
    if (process.platform === 'darwin') {
      const result = await runCommand(
        `curl -fsSL https://bun.sh/install | bash`,
        { env: { BUN_INSTALL: bunPath } },
      );
      if (result.code === 0) success = true;
    } else if (process.platform === 'win32') {
      const result = await runCommand(
        [
          '-ExecutionPolicy',
          'ByPass',
          '-Command',
          'irm bun.sh/install.ps1 | iex | iex',
        ],

        {
          env: {
            BUN_INSTALL: bunPath,
          },
          usePowerShell: true,
        },
      );
      if (result.code === 0) success = true;
    }
  } catch {
    success = false;
  }

  if (success) {
    appManager.toast('Bun Runtime installed successfully', { type: 'success' });
    return await getBunRuntime(true);
  } else {
    appManager.toast('Failed to install Bun Runtime', { type: 'error' });
    bun.status = 'not_installed';
  }
}

export async function uninstallBunRuntime() {
  const isWindows = process.platform === 'win32';
  const bunPath = path.join(
    app.getPath('userData'),
    '.runtime',
    'bin',
    isWindows ? 'bun.exe' : 'bun',
  );
  if (fs.existsSync(bunPath)) {
    await fs.promises.rm(bunPath, { recursive: true });
  }
  await getBunRuntime(true);
}
