import { LocalModelItem, LocalModelType } from '@/types/local-model';
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
  PreTrainedModel,
} from '@huggingface/transformers';

const MODEL_RELEASE_DELAY_MS = 5 * 60 * 1000;

type CachedModel = {
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
  processor?: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  tokenizer?: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  lastUsed?: number;
  releaseTimer?: ReturnType<typeof setTimeout>;
};

class LocalModelManager extends BaseManager {
  models: Record<string, CachedModel> = {};
  modelLoadPromises: Record<string, Promise<CachedModel>> = {};

  constructor() {
    super();
  }

  public async init() {}

  @channel(LocalModelChannel.GetList)
  public async getList(
    type?: LocalModelType,
  ): Promise<Record<LocalModelType, LocalModelItem[]>> {
    const types = Object.keys(models);
    const output = {} as Record<LocalModelType, LocalModelItem[]>;
    const appInfo = await appManager.getInfo();
    for (const _type of types) {
      if (type && _type !== type) continue;
      const modelList = models[_type];

      for (const model of modelList) {
        const modelName = model.id.split('/').pop();
        const modelPath = path.join(appInfo.modelPath, _type, modelName);
        model.isDownloaded = fs.existsSync(modelPath);
      }
      output[_type] = modelList;
    }

    return output;
  }

  @channel(LocalModelChannel.DownloadModel)
  public async downloadModel(data: {
    modelId: string;
    type: string;
    source: string;
  }): Promise<void> {
    const modelInfo = Object.values(models)
      .flat()
      .find((x) => x.id === data.modelId);
    const downloadInfo = modelInfo?.download?.find(
      (x) => x.source === data.source,
    );
    const appInfo = await appManager.getInfo();
    const uv = await getUVRuntime();
    const modelName = data.modelId.split('/').pop();

    const modelPath = path.join(appInfo.modelPath, data.type, modelName);
    const isWindows = process.platform === 'win32';
    const preCommand = isWindows ? 'uvx.exe' : './uvx';
    if (data.source === 'modelscope') {
      const res = await runCommand(
        `${preCommand} modelscope download --model ${modelInfo.repo} --local_dir "${modelPath}"`,
        {
          cwd: uv.dir,
        },
      );
      if (res.code !== 0) {
        await fs.promises.rm(modelPath, { recursive: true });
        throw new Error(`Failed to download model: ${res.stderr}`);
      }
    } else if (data.source === 'huggingface') {
      const res = await runCommand(
        `${preCommand} hf download ${modelInfo.repo} --local-dir "${modelPath}"`,
        {
          cwd: uv.dir,
        },
      );
      if (res.code !== 0) {
        await fs.promises.rm(modelPath, { recursive: true });
        throw new Error(`Failed to download model: ${res.stderr}`);
      }
    }
  }

  @channel(LocalModelChannel.DeleteModel)
  public async deleteModel(
    modelId: string,
    type: LocalModelType,
  ): Promise<void> {
    const modelInfo = Object.values(models)
      .flat()
      .find((x) => x.id === modelId);
    const appInfo = await appManager.getInfo();
    const modelName = modelId.split('/').pop();

    const modelPath = path.join(appInfo.modelPath, type, modelName);
    if (fs.existsSync(modelPath)) {
      await fs.promises.rm(modelPath, { recursive: true });
    }
  }

  public async ensureModelLoaded(
    task:
      | 'background-removal'
      | 'feature-extraction'
      | 'text-classification'
      | 'image-feature-extraction'
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
