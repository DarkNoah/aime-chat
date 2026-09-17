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
  getLocalModelPath,
} from './model-files';
import { getAudioModelCatalog } from './audio-models';
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

function getCatalog(type: LocalModelType): LocalModelItem[] {
  return type === 'tts' || type === 'stt'
    ? getAudioModelCatalog(type)
    : (models[type] as LocalModelItem[]);
}

function getCatalogModel(type: unknown, modelId: unknown): LocalModelItem {
  validateModelType(type);
  if (typeof modelId !== 'string')
    throw localModelError('modelId must be a string');
  const model = getCatalog(type).find((item) => item.id === modelId);
  if (!model) throw localModelError(`Unknown ${type} model: ${modelId}`);
  return model;
}

class LocalModelManager extends BaseManager {
  private operations = new Map<string, 'downloading' | 'deleting'>();

  private audioUses = new Map<string, number>();

  private releaseAudioModels?: () => Promise<void>;

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
    const modelPath = getLocalModelPath(root, type, model.id);
    const operation = this.operations.get(`${type}:${model.id}`);
    const isDownloaded =
      !operation &&
      isModelFullyDownloaded(modelPath, model) &&
      (model.dependencies || []).every(
        (id) =>
          !this.operations.has(`${type}:${id}`) &&
          isModelFullyDownloaded(
            getLocalModelPath(root, type, id),
            getCatalogModel(type, id),
          ),
      );
    return {
      ...model,
      type,
      modelPath,
      providerModelId:
        ['embedding', 'reranker', 'clip', 'tts', 'stt'].includes(type) &&
        model.selectable !== false
          ? `local/${model.speechModelId || model.id}`
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
      output[modelType] = getCatalog(modelType).map((model) =>
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
      for (const dependency of model.dependencies || []) {
        // These downloads are part of the user's explicit model-download action.
        // eslint-disable-next-line no-await-in-loop
        await this.downloadModel({ modelId: dependency, type, source });
      }
      const modelPath = getLocalModelPath(appInfo.modelPath, type, model.id);
      if (!isModelFullyDownloaded(modelPath, model)) {
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
            model.download.find((item) => item.source === source)?.repo ||
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
        if (!isModelFullyDownloaded(modelPath, model)) {
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
      (['tts', 'stt'].includes(type) && this.audioUses.size > 0) ||
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
      if (type === 'tts' || type === 'stt') await this.releaseAudioModels?.();
      const appInfo = await appManager.getInfo();
      const modelPath = getLocalModelPath(appInfo.modelPath, type, model.id);
      await fs.promises.rm(modelPath, { recursive: true, force: true });
      this.operations.delete(key);
      return this.modelStatus(model, type, appInfo.modelPath);
    } finally {
      this.operations.delete(key);
    }
  }

  public setAudioModelReleaseHandler(handler: () => Promise<void>) {
    this.releaseAudioModels = handler;
  }

  public async getAvailableAudioModels(type: 'tts' | 'stt') {
    const catalog = (await this.getList(type))[type];
    const available = new Map<string, { id: string; name: string }>();
    for (const item of catalog) {
      if (item.isDownloaded && item.selectable !== false) {
        const id = item.speechModelId || item.id;
        available.set(id, {
          id,
          name: item.speechModelId ? id.split('/').pop() : item.name || item.id,
        });
      }
    }
    return [...available.values()];
  }

  public async acquireAudioModel(type: 'tts' | 'stt', modelId: string) {
    const model = getCatalogModel(type, modelId);
    const { modelPath: root } = await appManager.getInfo();
    if (
      [...this.operations].some(
        ([key, op]) => op === 'deleting' && /^(tts|stt):/.test(key),
      )
    ) {
      throw localModelError(
        'An audio model is being deleted; retry when it finishes.',
        409,
      );
    }
    const ids = [modelId, ...(model.dependencies || [])];
    const modelPaths: Record<string, string> = {};
    for (const id of ids) {
      const item = this.modelStatus(getCatalogModel(type, id), type, root);
      if (!item.isDownloaded) {
        throw localModelError(
          `Audio model ${id} is not downloaded or incomplete. Download it in Settings > Local Models (${type.toUpperCase()}) first.`,
          409,
        );
      }
      modelPaths[id] = item.modelPath;
    }
    for (const id of ids)
      this.audioUses.set(
        `${type}:${id}`,
        (this.audioUses.get(`${type}:${id}`) || 0) + 1,
      );
    let released = false;
    return {
      modelPaths,
      alignerModel: type === 'stt' ? model.dependencies?.[0] : undefined,
      release: () => {
        if (released) return;
        released = true;
        for (const id of ids) {
          const key = `${type}:${id}`;
          const count = (this.audioUses.get(key) || 1) - 1;
          if (count) this.audioUses.set(key, count);
          else this.audioUses.delete(key);
        }
      },
    };
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
