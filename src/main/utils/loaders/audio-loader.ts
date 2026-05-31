import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { randomUUID } from 'crypto';
import { BaseLoader } from './base-loader';
import { getAssetPath } from '..';
import { getQwenAudioRuntime, getUVRuntime } from '@/main/app/runtime';
import { appManager } from '@/main/app';
import { runCommand } from '../shell';

export type AudioLoaderOptions = {
  model?: string;
  backend?: 'transformers' | 'mlx-audio';
  device?: string;
  dtype?: string;
  language?: string | null;
  returnTimeStamps?: boolean;
  outputType?: 'asr' | 'txt';
};

export type TTSOptions = {
  text: string;
  language?: string;
  voice?: string;
  instruct?: string;
  ref_audio?: string;
  ref_text?: string;
  model?: string;
  outputPath: string;
};

interface PythonClientOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

function createPythonClient({ command, args, cwd, env }: PythonClientOptions) {
  let proc: ChildProcess | null = null;
  let rl: readline.Interface | null = null;
  const pending = new Map<string, PendingRequest>();

  function start() {
    if (proc) return;

    proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: { ...process.env, ...env },
    });

    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');

    rl = readline.createInterface({ input: proc.stdout! });
    rl.on('line', (line: string) => {
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      const id = msg.id;
      if (id && pending.has(id)) {
        const { resolve, reject, timer } = pending.get(id)!;
        timer && clearTimeout(timer);
        pending.delete(id);
        msg.ok ? resolve(msg) : reject(new Error(msg.error || 'python error'));
      }
    });

    proc.on('exit', (code) => {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error(`python exited: ${code}`));
      }
      pending.clear();
      proc = null;
      rl?.close();
      rl = null;
    });

    proc.stderr?.on('data', (d: string | Buffer) => {
      console.error('[qwen-asr-py]', d.toString());
    });
  }

  function call(
    method: string,
    params: Record<string, any>,

  ): Promise<any> {
    start();
    const id = randomUUID();
    const payload = { id, method, params };

    return new Promise((resolve, reject) => {
      // const timer = setTimeout(() => {
      //   pending.delete(id);
      //   reject(new Error(`timeout: ${method}`));
      // }, timeoutMs);

      pending.set(id, { resolve, reject, timer: undefined });
      proc!.stdin!.write(JSON.stringify(payload) + '\n');
    });
  }

  function stop() {
    if (!proc) return;
    proc.kill();
  }

  return { call, start, stop };
}

let qwenAsrService: any = null;
let qwenAsrInitializing: Promise<void> | null = null;
let pythonClient: ReturnType<typeof createPythonClient> | null = null;

export async function destroyQwenAsrService(): Promise<void> {
  qwenAsrInitializing = null;
  qwenAsrService = null;
  if (pythonClient) {
    pythonClient.stop();
    pythonClient = null;
  }
}

async function syncQwenAudioRuntime(sourceDir: string, targetDir: string) {
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === '__pycache__' || entry.name === 'tests') {
        return;
      }

      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        await fs.promises.mkdir(targetPath, { recursive: true });
        await syncQwenAudioRuntime(sourcePath, targetPath);
        return;
      }

      if (!entry.isFile()) {
        return;
      }

      if (fs.existsSync(targetPath)) {
        const [sourceContent, currentContent] = await Promise.all([
          fs.promises.readFile(sourcePath),
          fs.promises.readFile(targetPath),
        ]);
        if (sourceContent.equals(currentContent)) {
          return;
        }
        await fs.promises.rm(targetPath);
      }

      await fs.promises.cp(sourcePath, targetPath);
    }),
  );
}

async function ensureRuntimeFile(runtimeDir: string): Promise<string> {
  const runtimeFile = path.join(runtimeDir, 'main.py');
  const assetRuntimeDir = getAssetPath('runtime', 'qwen-audio');

  await fs.promises.mkdir(runtimeDir, { recursive: true });
  await syncQwenAudioRuntime(assetRuntimeDir, runtimeDir);

  return runtimeFile;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function getPythonPackageVersion(
  uvBin: string,
  runtimeDir: string,
  packageName: string,
  env?: Record<string, string>,
): Promise<string | undefined> {
  const versionScript = `from importlib import metadata; print(metadata.version(${JSON.stringify(packageName)}))`;
  const result = await runCommand(
    [
      quoteShellArg(uvBin),
      '--project',
      quoteShellArg(runtimeDir),
      'run',
      'python',
      '-c',
      quoteShellArg(versionScript),
    ].join(' '),
    {
      cwd: runtimeDir,
      env,
      timeout: 30_000,
    },
  );
  if (result.code !== 0) {
    return undefined;
  }
  return result.stdout.trim() || undefined;
}

async function ensureMlxAudioLatest(
  uvBin: string,
  runtimeDir: string,
  env?: Record<string, string>,
) {
  if (process.platform === 'win32') {
    return;
  }

  if (process.env.QWEN_ASR_MLX_AUDIO_UPDATE_CHECK === '0') {
    return;
  }

  try {
    const beforeVersion = await getPythonPackageVersion(
      uvBin,
      runtimeDir,
      'mlx-audio',
      env,
    );

    const result = await runCommand(
      [
        quoteShellArg(uvBin),
        '--project',
        quoteShellArg(runtimeDir),
        'add',
        'mlx-audio',
        '--prerelease=allow',
        '--upgrade-package',
        'mlx-audio',
      ].join(' '),
      {
        cwd: runtimeDir,
        env,
        timeout: 5 * 60_000,
      },
    );

    if (result.code !== 0) {
      console.warn(
        '[qwen-asr-py] mlx-audio update check failed:',
        result.stderr || result.stdout,
      );
      return;
    }

    const afterVersion = await getPythonPackageVersion(
      uvBin,
      runtimeDir,
      'mlx-audio',
      env,
    );
    if (beforeVersion && afterVersion && beforeVersion !== afterVersion) {
      console.info(
        `[qwen-asr-py] mlx-audio updated: ${beforeVersion} -> ${afterVersion}`,
      );
    } else {
      console.info(
        `[qwen-asr-py] mlx-audio is up to date${afterVersion ? ` (${afterVersion})` : ''}`,
      );
    }
  } catch (error) {
    console.warn('[qwen-asr-py] mlx-audio update check failed:', error);
  }
}

export type QwenAudioService = {
  transcribe: (
    buffer: Buffer,
    options?: AudioLoaderOptions & {
      ext?: string;
    },
  ) => Promise<{ text: string; result: any }>;
  synthesize: (options: TTSOptions) => Promise<{
    outputPath: string;
    sampleRate: number;
    duration: number;
    model: string;
  }>;
  ping: () => Promise<any>;
};

export async function getQwenAsrPythonService(): Promise<QwenAudioService> {
  if (qwenAsrService) {
    return qwenAsrService;
  }

  if (qwenAsrInitializing) {
    await qwenAsrInitializing;
    return qwenAsrService!;
  }

  qwenAsrInitializing = (async () => {
    const [sttRuntime, uvRuntime] = await Promise.all([
      getQwenAudioRuntime(),
      getUVRuntime(),
    ]);

    if (!uvRuntime || uvRuntime.status !== 'installed' || !uvRuntime.path) {
      throw new Error('UV runtime is not installed');
    }

    if (!sttRuntime || sttRuntime.status !== 'installed' || !sttRuntime.dir) {
      throw new Error('STT runtime is not installed');
    }

    const runtimeFile = await ensureRuntimeFile(sttRuntime.dir);
    const runtimeDir = path.dirname(runtimeFile);
    const tempDir = path.join(runtimeDir, 'tmp');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const uvBin = uvRuntime.path;
    const isWindows = process.platform === 'win32';

    const activateSourcePython = isWindows
      ? path.join(sttRuntime.dir, '.venv', 'Scripts', 'python.exe')
      : path.join(sttRuntime.dir, '.venv', 'bin', 'python');

    const env: Record<string, string> = {};

    if (appManager.appProxy?.host && appManager.appProxy?.port) {
      env.HTTP_PROXY = `http://${appManager.appProxy.host}:${appManager.appProxy.port}`;
      env.HTTPS_PROXY = `http://${appManager.appProxy.host}:${appManager.appProxy.port}`;
    }

    await ensureMlxAudioLatest(uvBin, runtimeDir, env);

    pythonClient = createPythonClient({
      command: uvBin,
      args: ['run', '--project', runtimeDir, 'python', 'main.py'],
      cwd: runtimeDir,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        ...env,
      },
    });

    qwenAsrService = {
      transcribe: async (
        buffer: Buffer,
        options: AudioLoaderOptions & { ext?: string } = {},
      ): Promise<{ text: string; result: any }> => {
        const ext =
          options.ext && options.ext.startsWith('.')
            ? options.ext
            : options.ext
              ? `.${options.ext}`
              : '.wav';
        const audioPath = path.join(tempDir, `${randomUUID()}${ext}`);

        await fs.promises.writeFile(audioPath, buffer);

        try {
          const response = await pythonClient!.call('predict', {
            audio_path: audioPath,
            model: options.model,
            backend:
              process.platform === 'darwin' ? 'mlx-audio' : options.backend,
            device: options.device,
            dtype: options.dtype,
            language: options.language ?? null,
            return_time_stamps: true,
            output_type: options.outputType ?? 'txt',
          });

          const result = response.result || {};
          const outputType = options.outputType ?? 'txt';

          return {
            text:
              outputType === 'asr'
                ? JSON.stringify(result, null, 2)
                : result.text || '',
            result,
          };
        } catch (error) {
          console.error('[qwen-asr-py]', error);
          throw error;
        } finally {
          if (fs.existsSync(audioPath)) {
            await fs.promises.rm(audioPath);
          }
        }
      },
      synthesize: async (
        options: TTSOptions,
      ): Promise<{
        outputPath: string;
        sampleRate: number;
        duration: number;
        model: string;
      }> => {
        const response = await pythonClient!.call('tts', {
          text: options.text.replaceAll('\r\n', '\n').replaceAll('\n', ''),
          language: options.language ?? 'English',
          voice: options.voice ?? undefined,
          instruct: options.instruct ?? undefined,
          ref_audio: options.ref_audio ?? undefined,
          ref_text: options.ref_text ?? undefined,
          model: options.model ?? undefined,
          output_path: options.outputPath,
        });

        const result = response.result || {};
        return {
          outputPath: result.output_path || options.outputPath,
          sampleRate: result.sample_rate || 24000,
          duration: result.duration || 0,
          model: result.model || '',
        };
      },
      ping: async () => {
        const response = await pythonClient!.call('ping', {});
        return response.result;
      },
    };
  })();

  try {
    await qwenAsrInitializing;
  } finally {
    qwenAsrInitializing = null;
  }

  return qwenAsrService!;
}

export class AudioLoader extends BaseLoader {
  options: AudioLoaderOptions;

  constructor(filePathOrBlob: string | Blob, options?: AudioLoaderOptions) {
    super(filePathOrBlob);
    this.options = options ?? {};
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    const service = await getQwenAsrPythonService();
    const result = await service.transcribe(raw, {
      ...this.options,
      ext: path.extname(metadata['source'] || '').toLowerCase() || '.wav',
    });
    return result.result;
  }

  async getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    const service = await getQwenAsrPythonService();
    return service.ping();
  }
}
