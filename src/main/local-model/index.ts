import {
  LocalModelItem,
  LocalModelType,
  LocalModelTypes,
} from '@/types/local-model';
import { api } from '../api/ApiController';
import {
  buildModelDownloadCommand,
  DOWNLOAD_MARKER,
  isModelFullyDownloaded,
} from './model-files';
import { BaseManager } from '../BaseManager';
import { channel } from '../ipc/IpcController';
import { LocalModelChannel } from '@/types/ipc-channel';
import models from './models.json';
import { appManager } from '../app';
import path from 'path';
import fs from 'fs';
import { runCommand } from '../utils/shell';
import { getUVRuntime } from '../app/runtime';
import {
  AutoModel,
  AutoModelForSequenceClassification,
  AutoProcessor,
  AutoTokenizer,
  CLIPModel,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  JinaCLIPImageProcessor,
  pipeline,
  PreTrainedModel,
} from '@huggingface/transformers';

const MODEL_RELEASE_DELAY_MS = 5 * 60 * 1000;

type CachedModel = {
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
  processor?:
    | Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>
    | Awaited<ReturnType<typeof JinaCLIPImageProcessor.from_pretrained>>;
  tokenizer?: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  textModel?: Awaited<
    ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>
  >;
  lastUsed?: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
};

function localModelError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateModelType(type: unknown): asserts type is LocalModelType {
  if (
    typeof type !== 'string' ||
    !LocalModelTypes.includes(type as LocalModelType)
  ) {
    throw localModelError(`Unknown local model type: ${String(type)}`);
  }
}

function getCatalogModel(type: unknown, modelId: unknown): LocalModelItem {
  validateModelType(type);
  if (typeof modelId !== 'string')
    throw localModelError('modelId must be a string');
  const model = (models[type] as LocalModelItem[]).find(
    (item) => item.id === modelId,
  );
  if (!model) throw localModelError(`Unknown ${type} model: ${modelId}`);
  return model;
}

class LocalModelManager extends BaseManager {
  private operations = new Map<string, 'downloading' | 'deleting'>();
  models: Record<string, CachedModel> = {};
  modelLoadPromises: Record<string, Promise<CachedModel>> = {};

  constructor() {
    super();
  }

  public async init() {}

  private modelStatus(
    model: LocalModelItem,
    type: LocalModelType,
    root: string,
  ): LocalModelItem {
    const modelPath = path.join(root, type, model.id.split('/').pop());
    const operation = this.operations.get(`${type}:${model.id}`);
    const isDownloaded = !operation && isModelFullyDownloaded(modelPath);
    return {
      ...model,
      type,
      modelPath,
      providerModelId: ['embedding', 'reranker', 'clip'].includes(type)
        ? `local/${model.id}`
        : undefined,
      isDownloaded,
      status:
        operation ||
        (isDownloaded
          ? 'downloaded'
          : fs.existsSync(modelPath)
            ? 'incomplete'
            : 'not_downloaded'),
    };
  }

  @api({
    method: 'get',
    path: '/api/local-models/list',
    args: (req) => [req.query.type],
  })
  @channel(LocalModelChannel.GetList)
  public async getList(
    type?: LocalModelType,
  ): Promise<Record<LocalModelType, LocalModelItem[]>> {
    if (type !== undefined) validateModelType(type);
    const output = {} as Record<LocalModelType, LocalModelItem[]>;
    const appInfo = await appManager.getInfo();
    for (const modelType of LocalModelTypes) {
      if (type && modelType !== type) continue;
      output[modelType] = (models[modelType] as LocalModelItem[]).map((model) =>
        this.modelStatus(model, modelType, appInfo.modelPath),
      );
    }
    return output;
  }

  @api({ method: 'post', path: '/api/local-models/download' })
  @channel(LocalModelChannel.DownloadModel)
  public async downloadModel(data: {
    modelId: string;
    type: string;
    source: string;
  }): Promise<LocalModelItem> {
    const model = getCatalogModel(data?.type, data?.modelId);
    const { type, source } = data;
    if (
      !['huggingface', 'modelscope'].includes(source) ||
      !model.download?.some((item) => item.source === source) ||
      !model.repo
    ) {
      throw localModelError(`Unsupported download source: ${String(source)}`);
    }
    const key = `${type}:${model.id}`;
    if (this.operations.has(key))
      throw localModelError('A model operation is already in progress', 409);
    this.operations.set(key, 'downloading');
    try {
      const appInfo = await appManager.getInfo();
      const modelPath = path.join(
        appInfo.modelPath,
        type,
        model.id.split('/').pop(),
      );
      if (!isModelFullyDownloaded(modelPath)) {
        const uv = await getUVRuntime(true);
        const isWindows = process.platform === 'win32';
        if (
          !uv?.installed ||
          uv.status !== 'installed' ||
          !uv.dir ||
          !fs.existsSync(path.join(uv.dir, isWindows ? 'uvx.exe' : 'uvx'))
        ) {
          throw localModelError(
            'UV runtime is required. Use the runtime skill to install or repair UV before downloading models.',
            409,
          );
        }
        fs.mkdirSync(modelPath, { recursive: true });
        const marker = path.join(modelPath, DOWNLOAD_MARKER);
        fs.writeFileSync(
          marker,
          'Download has not completed. Retry through Aime Chat.',
        );
        const result = await runCommand(
          buildModelDownloadCommand(
            source as 'huggingface' | 'modelscope',
            model.repo,
            modelPath,
            isWindows,
          ),
          {
            cwd: uv.dir,
            usePowerShell: isWindows,
            env: {
              UV_DEFAULT_INDEX:
                'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple',
            },
          },
        );
        if (result.code !== 0) {
          throw localModelError(
            `Failed to download model: ${result.stderr || result.stdout || result.error?.message || result.code}`,
            500,
          );
        }
        await fs.promises.rm(marker, { force: true });
        if (!isModelFullyDownloaded(modelPath)) {
          fs.writeFileSync(
            marker,
            'Downloaded files did not pass the completeness check.',
          );
          throw localModelError(
            'Model download is incomplete; query the model status before retrying',
            500,
          );
        }
      }
      this.operations.delete(key);
      return this.modelStatus(model, type as LocalModelType, appInfo.modelPath);
    } finally {
      this.operations.delete(key);
    }
  }

  @api({
    method: 'post',
    path: '/api/local-models/delete',
    args: (req) => [req.body?.modelId, req.body?.type],
  })
  @channel(LocalModelChannel.DeleteModel)
  public async deleteModel(
    modelId: string,
    type: LocalModelType,
  ): Promise<LocalModelItem> {
    const model = getCatalogModel(type, modelId);
    const key = `${type}:${model.id}`;
    if (
      this.operations.has(key) ||
      this.models[modelId] ||
      this.modelLoadPromises[modelId]
    ) {
      throw localModelError(
        'Model is downloading, deleting or loaded in memory; retry after it is idle',
        409,
      );
    }
    this.operations.set(key, 'deleting');
    try {
      const appInfo = await appManager.getInfo();
      const modelPath = path.join(
        appInfo.modelPath,
        type,
        model.id.split('/').pop(),
      );
      await fs.promises.rm(modelPath, { recursive: true, force: true });
      this.operations.delete(key);
      return this.modelStatus(model, type, appInfo.modelPath);
    } finally {
      this.operations.delete(key);
    }
  }

  public async ensureModelLoaded(
    task:
      | 'background-removal'
      | 'feature-extraction'
      | 'text-classification'
      | 'image-feature-extraction'
      | 'zero-shot-image-classification'
      | string,
    modelName: string,
    modelPath: string,
    options?: {
      dtype?:
        | 'auto'
        | 'fp16'
        | 'q8'
        | 'q4'
        | 'fp32'
        | 'int8'
        | 'uint8'
        | 'bnb4'
        | 'q4f16'
        | Record<
            string,
            | 'auto'
            | 'fp16'
            | 'q8'
            | 'q4'
            | 'fp32'
            | 'int8'
            | 'uint8'
            | 'bnb4'
            | 'q4f16'
          >;
    },
  ): Promise<CachedModel> {
    if (
      [...this.operations.keys()].some((key) => key.endsWith(`:${modelName}`))
    ) {
      throw localModelError(
        'Model files are being downloaded or deleted; retry after the operation completes',
        409,
      );
    }
    // 如果模型已缓存，更新 lastUsed 并重置计时器
    if (this.models[modelName]) {
      const entry = this.models[modelName];
      entry.lastUsed = Date.now();
      this.scheduleModelRelease(modelName);
      return entry;
    }

    // 如果正在加载中，等待加载完成
    if (this.modelLoadPromises[modelName]) {
      const entry = await this.modelLoadPromises[modelName];
      entry.lastUsed = Date.now();
      this.scheduleModelRelease(modelName);
      return entry;
    }

    // 开始加载模型
    this.modelLoadPromises[modelName] = (async () => {
      let entry: CachedModel;
      if (task == 'background-removal' || task == 'image-feature-extraction') {
        const [model, processor] = await Promise.all([
          AutoModel.from_pretrained(modelPath, {
            local_files_only: true,
          }),
          AutoProcessor.from_pretrained(modelPath, {}),
        ]);
        entry = {
          model,
          processor,
        };
      } else if (
        modelName == 'chinese-clip-vit-large-patch14-336px' ||
        modelName == 'jina-clip-v2'
      ) {
        const [tokenizer, processor, model] = await Promise.all([
          AutoTokenizer.from_pretrained(modelPath),
          modelName == 'jina-clip-v2'
            ? JinaCLIPImageProcessor.from_pretrained(modelPath)
            : AutoProcessor.from_pretrained(modelPath),
          AutoModel.from_pretrained(modelPath),
        ]);
        entry = {
          model,
          tokenizer,
          processor,
        };
      } else if (task == 'text-classification') {
        const [model, tokenizer] = await Promise.all([
          AutoModelForSequenceClassification.from_pretrained(modelPath, {
            local_files_only: true,
            dtype: options?.dtype,
          }),
          AutoTokenizer.from_pretrained(modelPath),
        ]);
        entry = {
          model,
          tokenizer,
        };
      } else if (task == 'feature-extraction') {
        const [model, tokenizer] = await Promise.all([
          AutoModel.from_pretrained(modelPath, {
            local_files_only: true,
            dtype: options?.dtype,
          }),
          AutoTokenizer.from_pretrained(modelPath),
        ]);
        entry = {
          model,
          tokenizer,
        };
      } else if (task == 'zero-shot-image-classification') {
        const [model, tokenizer, processor, textModel] = await Promise.all([
          CLIPVisionModelWithProjection.from_pretrained(modelPath, {
            local_files_only: true,
            dtype: options?.dtype,
          }),
          AutoTokenizer.from_pretrained(modelPath),
          AutoProcessor.from_pretrained(modelPath),
          CLIPTextModelWithProjection.from_pretrained(modelPath, {
            local_files_only: true,
            dtype: options?.dtype,
          }),
        ]);
        entry = {
          model,
          tokenizer,
          processor,
          textModel,
        };
      } else if (task == 'jina-clip-v2') {
      }
      entry.lastUsed = Date.now();
      this.models[modelName] = entry;
      return entry;
    })();

    try {
      const entry = await this.modelLoadPromises[modelName];
      // 加载完成后启动释放计时器
      this.scheduleModelRelease(modelName);
      return entry;
    } finally {
      delete this.modelLoadPromises[modelName];
    }
  }

  scheduleModelRelease(modelName: string) {
    const entry = this.models[modelName];
    if (!entry) {
      return;
    }

    // 清除已有的计时器
    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
    }

    // 设置新的释放计时器
    entry.releaseTimer = setTimeout(() => {
      entry.releaseTimer = undefined;
      void this.releaseModelIfIdle(modelName);
    }, MODEL_RELEASE_DELAY_MS);
  }

  async releaseModelIfIdle(modelName: string): Promise<void> {
    const entry = this.models[modelName];
    if (!entry) {
      return;
    }

    const idleTime = Date.now() - entry.lastUsed;
    // 如果空闲时间不足，重新调度释放
    if (idleTime < MODEL_RELEASE_DELAY_MS) {
      this.scheduleModelRelease(modelName);
      return;
    }

    // 释放模型资源
    try {
      await entry.model?.dispose?.();
      console.warn(`release model ${modelName} success`);
    } catch (error) {
      console.warn(`release model ${modelName} failed`, error);
    } finally {
      delete this.models[modelName];
    }
  }
}

export const localModelManager = new LocalModelManager();
