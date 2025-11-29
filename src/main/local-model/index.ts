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

class LocalModelManager extends BaseManager {
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

    if (data.source === 'modelscope') {
      const res = await runCommand(
        `./uvx modelscope download --model ${modelInfo.repo} --local_dir "${modelPath}"`,
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
        `./uvx hf download ${modelInfo.repo} --local-dir "${modelPath}"`,
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
}

export const localModelManager = new LocalModelManager();
