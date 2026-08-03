import fs from 'fs';
import path from 'path';
import { app, net } from 'electron';
import { RuntimeInfo } from '@/types/app';

export const CODE_EXECUTION_PACKAGE_INDEX =
  'https://mirrors.aliyun.com/pypi/simple/';

/**
 * Keep the index URL in offline mode because uv keys cached registry metadata
 * by index. `--offline` prevents network access; it does not select the index
 * whose cached metadata should be used.
 */
export function getCodeExecutionPackageIndexOptions(offline: boolean) {
  return [
    `--default-index ${CODE_EXECUTION_PACKAGE_INDEX}`,
    ...(offline ? ['--offline'] : []),
  ].join(' ');
}

/**
 * Keep the default cache broad enough for everyday office and data work while
 * excluding heavyweight AI/GPU runtimes such as torch and tensorflow.
 */
export const CODE_EXECUTION_PACKAGE_GROUPS = {
  runtime: ['mcp'],
  office: [
    'openpyxl',
    'xlsxwriter',
    'xlrd',
    'pyxlsb',
    'odfpy',
    'python-docx',
    'python-pptx',
    'pypdf',
    'pdfplumber',
    'reportlab',
  ],
  data: [
    'numpy',
    'pandas',
    'scipy',
    'scikit-learn',
    'polars',
    'pyarrow',
    'duckdb',
    'sqlalchemy',
    'matplotlib',
    'seaborn',
    'plotly',
    'statsmodels',
  ],
  productivity: [
    'requests',
    'beautifulsoup4',
    'lxml',
    'pillow',
    'pyyaml',
    'jinja2',
    'tabulate',
    'tqdm',
    'rich',
    'rapidfuzz',
    'jieba',
    'xmltodict',
    'python-dateutil',
    'icalendar',
  ],
} as const;

export const COMMON_CODE_EXECUTION_PACKAGES = Array.from(
  new Set(Object.values(CODE_EXECUTION_PACKAGE_GROUPS).flat()),
);

const CACHE_RETRY_DELAY_MS = 5 * 60 * 1000;
const CACHE_WARMUP_TIMEOUT_MS = 15 * 60 * 1000;

type UVRuntime = NonNullable<RuntimeInfo['uv']>;
type CommandResult = {
  code: number;
  timedOut?: boolean;
  stderr?: string;
};
type CommandRunner = (
  command: string,
  options: {
    env: Record<string, string>;
    timeout: number;
  },
) => Promise<CommandResult>;
type CacheLogger = (
  level: 'info' | 'error',
  message: string,
  data: Record<string, unknown>,
) => void;
type WarmupDependencies = {
  runCommand: CommandRunner;
  log: CacheLogger;
};

let latestRuntime: UVRuntime | undefined;
let latestDependencies: WarmupDependencies | undefined;
let warmupPromise: Promise<boolean> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let cacheWarmed = false;

export function getCodeExecutionPackageCachePaths() {
  const root = path.join(app.getPath('userData'), '.runtime', 'code-execution');
  const warmupVenv = path.join(root, 'warmup-venv');
  const warmupPython =
    process.platform === 'win32'
      ? path.join(warmupVenv, 'Scripts', 'python.exe')
      : path.join(warmupVenv, 'bin', 'python');

  return {
    root,
    uvCache: path.join(root, 'uv-cache'),
    warmupVenv,
    warmupPython,
  };
}

export function withCodeExecutionPackageCache(
  env: Record<string, string> = {},
) {
  return {
    ...env,
    UV_CACHE_DIR: getCodeExecutionPackageCachePaths().uvCache,
  };
}

function quoteCommandArgument(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function warmCodeExecutionPackageCache(
  runtime: UVRuntime,
  dependencies: WarmupDependencies,
): Promise<boolean> {
  if (!runtime.installed || !runtime.path) {
    return false;
  }
  if (!net.isOnline()) {
    return false;
  }

  const paths = getCodeExecutionPackageCachePaths();
  await fs.promises.mkdir(paths.root, { recursive: true });
  await fs.promises.mkdir(paths.uvCache, { recursive: true });

  const python =
    runtime.pythonRuntime?.pythonPath ??
    runtime.pythonRuntime?.pythonVersion ??
    '3.12';
  const commonPackages = COMMON_CODE_EXECUTION_PACKAGES.join(' ');
  const commandEnv = withCodeExecutionPackageCache();

  if (!fs.existsSync(paths.warmupPython)) {
    const createResult = await dependencies.runCommand(
      [
        quoteCommandArgument(runtime.path),
        'venv',
        quoteCommandArgument(paths.warmupVenv),
        '--python',
        quoteCommandArgument(python),
        '--cache-dir',
        quoteCommandArgument(paths.uvCache),
        '--default-index',
        CODE_EXECUTION_PACKAGE_INDEX,
      ].join(' '),
      {
        env: commandEnv,
        timeout: CACHE_WARMUP_TIMEOUT_MS,
      },
    );
    if (createResult.code !== 0) {
      dependencies.log('error', '[code-execution] package cache setup failed', {
        stage: 'venv',
        code: createResult.code,
        timedOut: createResult.timedOut,
        stderr: createResult.stderr,
      });
      return false;
    }
  }

  const installResult = await dependencies.runCommand(
    [
      quoteCommandArgument(runtime.path),
      'pip install',
      commonPackages,
      '--python',
      quoteCommandArgument(paths.warmupPython),
      '--cache-dir',
      quoteCommandArgument(paths.uvCache),
      '--default-index',
      CODE_EXECUTION_PACKAGE_INDEX,
    ].join(' '),
    {
      env: commandEnv,
      timeout: CACHE_WARMUP_TIMEOUT_MS,
    },
  );

  if (installResult.code !== 0) {
    dependencies.log('error', '[code-execution] package cache warmup failed', {
      code: installResult.code,
      timedOut: installResult.timedOut,
      stderr: installResult.stderr,
    });
    return false;
  }

  dependencies.log('info', '[code-execution] package cache ready', {
    cacheDir: paths.uvCache,
    packages: COMMON_CODE_EXECUTION_PACKAGES,
  });
  return true;
}

function queueWarmup(delay: number) {
  if (
    retryTimer ||
    warmupPromise ||
    cacheWarmed ||
    !latestRuntime ||
    !latestDependencies
  ) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    if (!latestRuntime || !latestDependencies || cacheWarmed) return;

    const dependencies = latestDependencies;
    warmupPromise = warmCodeExecutionPackageCache(latestRuntime, dependencies);
    const currentWarmup = warmupPromise;
    const finishWarmup = async () => {
      try {
        cacheWarmed = await currentWarmup;
      } catch (error) {
        dependencies.log(
          'error',
          '[code-execution] package cache warmup failed',
          {
            message: error instanceof Error ? error.message : String(error),
          },
        );
      } finally {
        warmupPromise = undefined;
        if (!cacheWarmed) {
          queueWarmup(CACHE_RETRY_DELAY_MS);
        }
      }
    };
    finishWarmup().catch((error) => {
      dependencies.log(
        'error',
        '[code-execution] package cache warmup finalization failed',
        {
          message: error instanceof Error ? error.message : String(error),
        },
      );
    });
  }, delay);
  retryTimer.unref?.();
}

/**
 * Warm in the background so application startup is never blocked. If the
 * machine is offline, retry periodically and fill the cache when connectivity
 * returns.
 */
export function scheduleCodeExecutionPackageCacheWarmup(
  runtime: UVRuntime | undefined,
  dependencies: WarmupDependencies,
) {
  if (!runtime?.installed || !runtime.path) return;
  latestRuntime = runtime;
  latestDependencies = dependencies;
  queueWarmup(0);
}
