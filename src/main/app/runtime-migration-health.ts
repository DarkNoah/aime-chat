/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import fs from 'fs';
import path from 'path';
import { getManagedAgentBrowserEntry } from './agent-browser-runtime';
import {
  downloadRuntimeBinary,
  runtimeVersion,
  type RuntimeMigrationRunner as Run,
} from './runtime-download';

const WARMUP_VENV = 'code-execution/warmup-venv';
const VENV_PATHS = [
  'python-runtime/.venv',
  'paddleocr-runtime/.venv',
  'qwen-audio-runtime/.venv',
  WARMUP_VENV,
];
const PYTHON_SNAPSHOT =
  "import sys,json,os; from importlib.metadata import distributions; print(json.dumps({'prefix':sys.prefix,'base':sys.base_prefix,'executable':os.path.realpath(sys._base_executable),'version':list(sys.version_info[:3]),'packages':sorted((d.metadata['Name'] or '',d.version) for d in distributions())}))";
type PythonSnapshot = {
  prefix: string;
  base: string;
  executable: string;
  version: number[];
  packages: string[][];
};

export function pythonInVenv(root: string, venv: string) {
  return path.join(
    root,
    venv,
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
}

export type RuntimeMigrationVerification = {
  snapshots: [string, PythonSnapshot][];
  binaries: string[];
  realSource: string;
  agentBrowser?: boolean;
  binaryVersions?: Record<string, string>;
  agentBrowserVersion?: string;
  freshInstall?: boolean;
};

export async function verifyMigratedRuntime(
  target: string,
  source: string,
  data: RuntimeMigrationVerification,
  run: Run,
) {
  for (const binary of data.binaries) {
    if (!['uv', 'bun'].includes(binary))
      throw new Error('RUNTIME_MIGRATION_INVALID_RECEIPT');
    const version = await run(
      `"${path.join(target, 'bin', binary + (process.platform === 'win32' ? '.exe' : ''))}" --version`,
    );
    if (
      data.binaryVersions?.[binary] &&
      runtimeVersion(version) !== data.binaryVersions[binary]
    )
      throw new Error(
        'RUNTIME_MIGRATION_VERIFY_FAILED: Runtime version changed',
      );
  }
  for (const [venv, before] of data.snapshots) {
    if (!VENV_PATHS.includes(venv))
      throw new Error('RUNTIME_MIGRATION_INVALID_RECEIPT');
    const python = data.freshInstall
      ? `"${path.join(target, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')}" run --offline --no-cache --project "${path.dirname(path.join(target, venv))}" python`
      : `"${pythonInVenv(target, venv)}"`;
    const after = JSON.parse(
      (
        await run(`${python} -I -B -c "${PYTHON_SNAPSHOT}"`, {
          env: {
            UV_PYTHON_INSTALL_DIR: path.join(target, 'python'),
            UV_PROJECT_ENVIRONMENT: path.join(target, venv),
            VIRTUAL_ENV: '',
          },
        })
      )
        .trim()
        .split('\n')
        .pop()!,
    ) as PythonSnapshot;
    if (
      fs.realpathSync(after.prefix) !==
        fs.realpathSync(path.join(target, venv)) ||
      after.base.startsWith(`${source}${path.sep}`) ||
      after.base.startsWith(`${data.realSource}${path.sep}`) ||
      after.executable.startsWith(`${source}${path.sep}`) ||
      after.executable.startsWith(`${data.realSource}${path.sep}`) ||
      (data.freshInstall &&
        !fs
          .realpathSync(after.base)
          .startsWith(
            `${fs.realpathSync(path.join(target, 'python'))}${path.sep}`,
          )) ||
      JSON.stringify(before.version) !== JSON.stringify(after.version) ||
      JSON.stringify(before.packages) !== JSON.stringify(after.packages)
    ) {
      throw new Error('RUNTIME_MIGRATION_VERIFY_FAILED');
    }
    // Exercise a relocated entry point as well as the interpreter.
    const pip = path.join(
      target,
      venv,
      process.platform === 'win32' ? 'Scripts/pip.exe' : 'bin/pip',
    );
    if (fs.existsSync(pip)) await run(`"${pip}" --version`);
  }
  const browser = getManagedAgentBrowserEntry(target);
  if (data.agentBrowser || fs.existsSync(browser)) {
    const version = await run(`node "${browser}" -V`);
    if (
      data.agentBrowserVersion &&
      runtimeVersion(version) !== data.agentBrowserVersion
    )
      throw new Error(
        'RUNTIME_MIGRATION_VERIFY_FAILED: Agent Browser version changed',
      );
  }
}

export async function prepareRuntimeVerification(
  source: string,
  destination: string,
  run: Run,
  globalAgentBrowser?: string,
) {
  const realSource = fs.existsSync(source) ? fs.realpathSync(source) : source;
  const snapshots = new Map<string, PythonSnapshot>();
  const requirements = new Map<string, string>();
  const executableName = (name: string) =>
    name + (process.platform === 'win32' ? '.exe' : '');
  const uv = path.join(source, 'bin', executableName('uv'));
  for (const venv of VENV_PATHS) {
    // The warmup venv is disposable and may refer to an obsolete interpreter.
    // Read only the installed versions from real runtimes, never their files.
    if (venv === WARMUP_VENV) continue;
    if (!fs.existsSync(path.join(source, venv, 'pyvenv.cfg'))) continue;
    if (!fs.existsSync(uv))
      throw new Error('RUNTIME_MIGRATION_PYTHON_REQUIRES_UV');
    const snapshot = JSON.parse(
      (
        await run(
          `"${pythonInVenv(source, venv)}" -I -B -c "${PYTHON_SNAPSHOT}"`,
        )
      )
        .trim()
        .split('\n')
        .pop()!,
    ) as PythonSnapshot;
    snapshots.set(venv, snapshot);
    const frozen = await run(
      `"${uv}" pip freeze --no-cache --no-config --python "${pythonInVenv(source, venv)}"`,
    );
    // Local/editable installs cannot be redownloaded. Fail before touching the
    // destination instead of silently copying them or substituting a PyPI name.
    const lines = frozen
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    if (
      lines.some(
        (line) =>
          !/^[\w.-]+(?:==[\w.!+-]+| @ (?:https|git\+https):\/\/\S+)$/.test(
            line,
          ),
      )
    )
      throw new Error('RUNTIME_MIGRATION_LOCAL_PACKAGE_UNSUPPORTED');
    requirements.set(venv, lines.join('\n'));
  }
  const binaries: ('uv' | 'bun')[] = [];
  const binaryVersions: Record<string, string> = {};
  for (const name of ['uv', 'bun'] as const) {
    const binary = path.join(source, 'bin', executableName(name));
    if (!fs.existsSync(binary)) continue;
    binaries.push(name);
    binaryVersions[name] = runtimeVersion(await run(`"${binary}" --version`));
  }
  const localBrowser = path.dirname(
    path.dirname(getManagedAgentBrowserEntry(source)),
  );
  const browserDirectory = fs.existsSync(getManagedAgentBrowserEntry(source))
    ? localBrowser
    : globalAgentBrowser;
  const agentBrowserVersion = browserDirectory
    ? runtimeVersion(
        JSON.parse(
          await fs.promises.readFile(
            path.join(browserDirectory, 'package.json'),
            'utf8',
          ),
        ).version,
      )
    : undefined;
  const verificationData: RuntimeMigrationVerification = {
    snapshots: [...snapshots.entries()],
    binaries,
    binaryVersions,
    realSource,
    agentBrowser: !!browserDirectory,
    agentBrowserVersion,
    freshInstall: true,
  };
  return {
    install: async () => {
      const stagingCache = path.join(destination, '.install-cache');
      const env = {
        UV_CACHE_DIR: path.join(stagingCache, 'uv'),
        UV_PYTHON_CACHE_DIR: path.join(stagingCache, 'python'),
        UV_PYTHON_INSTALL_DIR: path.join(destination, 'python'),
        UV_PYTHON_BIN_DIR: path.join(destination, 'bin'),
        UV_PYTHON_INSTALL_BIN: '0',
        UV_PYTHON_INSTALL_REGISTRY: '0',
        UV_NO_CACHE: '1',
        UV_OFFLINE: '0',
        UV_PYTHON_DOWNLOADS: 'automatic',
        PIP_NO_CACHE_DIR: '1',
        PIP_CACHE_DIR: path.join(stagingCache, 'pip'),
        npm_config_cache: path.join(stagingCache, 'npm'),
        npm_config_offline: 'false',
        npm_config_prefer_offline: 'false',
        npm_config_prefer_online: 'true',
      };
      for (const name of binaries) {
        await downloadRuntimeBinary(
          name,
          binaryVersions[name],
          destination,
          run,
        );
      }
      const targetUv = path.join(destination, 'bin', executableName('uv'));
      const versions = new Set(
        [...snapshots.values()].map((snapshot) => snapshot.version.join('.')),
      );
      for (const version of versions) {
        if (!/^\d+\.\d+\.\d+$/.test(version))
          throw new Error(
            'RUNTIME_MIGRATION_VERIFY_FAILED: Invalid Python version',
          );
        await run(
          `"${targetUv}" python install ${version} --reinstall --no-cache --no-config --no-bin --no-registry`,
          { env, timeout: 30 * 60_000 },
        );
      }
      for (const [venv, before] of snapshots) {
        const project = path.dirname(path.join(destination, venv));
        await fs.promises.mkdir(project, { recursive: true });
        const version = before.version.join('.');
        await run(
          `"${targetUv}" venv --no-project --no-config --no-cache --managed-python --no-python-downloads --python "${version}" "${path.join(destination, venv)}"`,
          { env },
        );
        // uv run keeps extra installed packages by default. An empty project
        // lets OCR/audio select this venv without resolving or upgrading its
        // pinned packages, even when the command starts from the UV bin folder.
        await fs.promises.writeFile(
          path.join(project, 'pyproject.toml'),
          `[project]\nname = "${path.basename(project)}"\nversion = "0.1.0"\nrequires-python = "==${before.version.slice(0, 2).join('.')}.*"\n[tool.uv]\npackage = false\n`,
        );
        await fs.promises.writeFile(
          path.join(project, '.python-version'),
          `${version}\n`,
        );
        const requirementsFile = path.join(
          project,
          '.migration-requirements.txt',
        );
        const frozen = requirements.get(venv)!;
        await fs.promises.writeFile(requirementsFile, frozen);
        const indexes = [
          '--default-index https://mirrors.aliyun.com/pypi/simple/',
          ...(before.packages.some(([name]) => name === 'paddlepaddle-gpu')
            ? ['--index https://www.paddlepaddle.org.cn/packages/stable/cu126/']
            : []),
          ...(before.packages.some(
            ([name, packageVersion]) =>
              name === 'torch' && packageVersion.includes('+cu121'),
          )
            ? ['--index https://download.pytorch.org/whl/cu121']
            : []),
        ].join(' ');
        if (frozen.trim()) {
          await run(
            `"${targetUv}" pip install --no-cache --no-config --no-deps --python "${pythonInVenv(destination, venv)}" -r "${requirementsFile}" ${indexes}`,
            { env, timeout: 30 * 60_000 },
          );
        }
        await fs.promises.unlink(requirementsFile);
      }
      if (agentBrowserVersion) {
        const directory = path.join(destination, 'agent-browser');
        await fs.promises.mkdir(directory, { recursive: true });
        await run(
          `npm install --prefix "${directory}" --prefer-online --no-audit --no-fund agent-browser@${agentBrowserVersion}`,
          { env, timeout: 30 * 60_000 },
        );
      }
      await fs.promises.rm(stagingCache, { recursive: true, force: true });
    },
    verificationData,
    verify: (target: string) =>
      verifyMigratedRuntime(target, source, verificationData, run),
  };
}
