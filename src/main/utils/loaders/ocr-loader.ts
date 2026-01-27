import { OcrAccuracy, recognize } from '@napi-rs/system-ocr';
import { BaseLoader } from './base-loader';
import fs from 'fs';
import { appManager } from '@/main/app';
import path from 'path';
import { app } from 'electron';
import { getAssetPath } from '..';
import { getPaddleOcrRuntime, getUVRuntime } from '@/main/app/runtime';
import { spawn, ChildProcess } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import readline from 'readline';
import fg from 'fast-glob';

export type OcrLoaderOptions = {
  mode: 'auto' | 'system' | 'paddleocr' | 'mineru-api';
  splitPages?: boolean;
};

// ---------- Python Client ----------
interface PythonClientOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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
        clearTimeout(timer);
        pending.delete(id);
        msg.ok ? resolve(msg) : reject(new Error(msg.error || 'python error'));
      }
    });

    proc.on('exit', (code) => {
      // 进程退出时，清理所有 pending
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error(`python exited: ${code}`));
      }
      pending.clear();
      proc = null;
      rl?.close();
      rl = null;
    });

    proc.stderr?.on('data', (d: Buffer) => {
      // 可记录日志
      console.error('[paddleocr-py]', d.toString());
    });
  }

  function call(
    method: string,
    params: Record<string, any>,
    { timeoutMs = 600_000 } = {},
  ): Promise<any> {
    start();
    const id = randomUUID();
    const payload = { id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      proc!.stdin!.write(JSON.stringify(payload) + '\n');
    });
  }

  function stop() {
    if (!proc) return;
    proc.kill();
  }

  return { call, start, stop };
}

// 单例模式管理 PaddleOcrService 实例
let paddleOcrService: any = null;
let paddleOcrInitializing: Promise<void> | null = null;
let pythonClient: ReturnType<typeof createPythonClient> | null = null;

async function getPaddleOcrService(): Promise<any> {
  if (paddleOcrService) {
    return paddleOcrService;
  }

  if (paddleOcrInitializing) {
    await paddleOcrInitializing;
    return paddleOcrService!;
  }
  return null;

  // 动态导入 ESM 模块
  // const { PaddleOcrService } = await import('ppu-paddle-ocr');
  // const appInfo = await appManager.getInfo();
  // const modelPath = path.join(appInfo.modelPath, 'ocr', 'ppocrv5-onnx');

  // paddleOcrService = new PaddleOcrService({
  //   debugging: {
  //     debug: true,
  //     verbose: true,
  //     // debugFolder: './debug-output',
  //   },
  //   model: {
  //     detection: path.join(modelPath, 'ppocrv5-server-det.onnx'),
  //     recognition: path.join(modelPath, 'ppocrv5-server-rec.onnx'),
  //     charactersDictionary: path.join(modelPath, 'ppocrv5_dict.txt'),
  //   },
  //   detection: {
  //     autoDeskew: true,
  //   },
  // });

  // paddleOcrInitializing = paddleOcrService.initialize();
  // await paddleOcrInitializing;
  // paddleOcrInitializing = null;

  // return paddleOcrService;
}

export async function destroyPaddleOcrService(): Promise<void> {
  if (paddleOcrService) {
    await paddleOcrService.destroy();
    paddleOcrService = null;
  }
  if (pythonClient) {
    pythonClient.stop();
    pythonClient = null;
  }
}

async function ensureRuntimeFile(): Promise<string> {
  const runtimeFile = path.join(
    app.getPath('userData'),
    'paddleocr-runtime',
    'main.py',
  );
  const assetRuntimeFile = getAssetPath(
    'runtime',
    'paddleocr-runtime',
    'main.py',
  );

  if (!fs.existsSync(runtimeFile)) {
    await fs.promises.mkdir(path.dirname(runtimeFile), { recursive: true });
    await fs.promises.cp(assetRuntimeFile, runtimeFile);
  } else {
    const assetContent = await fs.promises.readFile(assetRuntimeFile);
    const currentContent = await fs.promises.readFile(runtimeFile);
    if (!assetContent.equals(currentContent)) {
      await fs.promises.rm(runtimeFile, { recursive: true });
      await fs.promises.cp(assetRuntimeFile, runtimeFile);
    }
  }

  return runtimeFile;
}

async function getPaddleOcrPythonService(): Promise<{
  recognize: (
    buffer: ArrayBufferLike,
    options?: { noCache?: boolean; ext?: string },
  ) => Promise<{ text: string; result: any }>;
}> {
  if (paddleOcrService) {
    return paddleOcrService;
  }

  if (paddleOcrInitializing) {
    await paddleOcrInitializing;
    return paddleOcrService!;
  }

  // 初始化
  const uvRuntime = await getUVRuntime();
  if (!uvRuntime || uvRuntime.status !== 'installed') {
    throw new Error('UV runtime is not installed');
  }

  const runtimeFile = await ensureRuntimeFile();
  const runtimeDir = path.dirname(runtimeFile);
  const cachePath = path.join(runtimeDir, 'cache');
  const outPath = path.join(runtimeDir, 'cache');

  // 确保缓存和输出目录存在
  await fs.promises.mkdir(cachePath, { recursive: true });
  await fs.promises.mkdir(outPath, { recursive: true });

  const isWindows = process.platform === 'win32';
  const uvBin = path.join(uvRuntime.dir, isWindows ? 'uv.exe' : 'uv');

  // 创建 Python 客户端
  pythonClient = createPythonClient({
    command: uvBin,
    args: ['run', '--project', runtimeDir, 'python', 'main.py'],
    cwd: runtimeDir,
  });

  paddleOcrService = {
    recognize: async (
      buffer: ArrayBufferLike,
      options: { noCache?: boolean; ext?: string } = {
        noCache: false,
        ext: '',
      },
    ): Promise<{ text: string; result: any }> => {
      // 计算 buffer 的 MD5 作为文件名
      const bufferData = Buffer.from(buffer);
      const md5Hash = createHash('md5').update(bufferData).digest('hex');

      const imagePath = path.join(cachePath, `${md5Hash}${options.ext}`);
      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      const imageOutDir = path.join(outPath, md5Hash);

      // 检查是否已有缓存的结果
      if (!options.noCache && fs.existsSync(imageOutDir)) {
        // 尝试读取已缓存的 markdown 结果
        try {
          const resultDirs = await fs.promises.readdir(imageOutDir);
          let text = '';
          for (const dir of resultDirs.sort()) {
            const mdFiles = await fg(
              path.join(imageOutDir, dir, md5Hash + '*.md').replace(/\\/g, '/'),
              {
                onlyFiles: true,
                caseSensitiveMatch: false,
              },
            );
            const mdPath = mdFiles.length > 0 ? mdFiles[0] : null;
            if (fs.existsSync(mdPath)) {
              const mdContent = await fs.promises.readFile(mdPath, 'utf-8');
              text += mdContent + '\n';
            }
          }
          if (text) {
            return {
              text: text.trim(),
              result: { cached: true, out_dir: imageOutDir },
            };
          }
        } catch {
          // 缓存读取失败，继续执行预测
        }
      }
      // 如果不使用缓存或文件不存在，则写入文件
      if (options.noCache || !fs.existsSync(imagePath)) {
        await fs.promises.writeFile(imagePath, bufferData);
      }
      // 调用 Python 服务
      const response = await pythonClient!.call('predict', {
        image_path: imagePath,
        out_dir: imageOutDir,
        save_json: true,
        save_markdown: true,
        device: 'cpu',
      });

      // 读取生成的 markdown 文件
      let text = '';
      if (response.result?.items) {
        for (const item of response.result.items) {
          if (item.markdown_dir) {
            const mdFiles = await fg(
              path
                .join(item.markdown_dir, md5Hash + '*.md')
                .replace(/\\/g, '/'),
              {
                onlyFiles: true,
                caseSensitiveMatch: false,
              },
            );
            const mdPath = mdFiles.length > 0 ? mdFiles[0] : null;
            if (fs.existsSync(mdPath)) {
              const mdContent = await fs.promises.readFile(mdPath, 'utf-8');
              text += mdContent + '\n';
            }
          }
        }
      }
      if (fs.existsSync(imagePath)) {
        await fs.promises.rm(imagePath);
      }
      return { text: text.trim(), result: response.result };
    },
  };

  return paddleOcrService;
}

export class OcrLoader extends BaseLoader {
  options: OcrLoaderOptions;

  constructor(filePathOrBlob: string | Blob, options?: OcrLoaderOptions) {
    super(filePathOrBlob);
    this.options = { mode: 'auto', ...(options ?? {}) };
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    let mode = this.options.mode;
    if (this.options.mode === 'auto') {
      const paddleOcrRuntime = await getPaddleOcrRuntime();
      if (paddleOcrRuntime.status === 'installed') {
        mode = 'paddleocr';
      } else {
        mode = 'system';
      }
    }
    if (mode === 'system') {
      const result = await recognize(raw, OcrAccuracy.Accurate);
      return result.text;
    }

    if (mode === 'paddleocr') {
      const service = await getPaddleOcrPythonService();
      const result = await service.recognize(raw.buffer, {
        noCache: false,
        ext: path.extname(metadata['source']).toLowerCase(),
      });
      return result.text;
    }

    throw new Error(`Unsupported OCR mode: ${mode}`);
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }
}
