import { Providers } from '@/entities/providers';
import { BaseProvider, OCRModel } from './base-provider';
import fs from 'fs';
import path from 'path';
import { ProviderCredits, ProviderTag, ProviderType } from '@/types/provider';
import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { isString } from '@/utils/is';
import { nanoid } from '@/utils/nanoid';
import os from 'os';
import unzipper from 'unzipper';
export class MineruOCRModel implements OCRModel {
  provider: string = 'mineru';
  modelId: string;
  baseUrl: string = 'https://mineru.net/api';

  providerEntity: Providers;

  constructor(modelId: string, providerEntity: Providers) {
    this.modelId = modelId;
    this.providerEntity = providerEntity;
  }


  async doOCR(options: { image: string }): Promise<string> {
    if (
      !isString(options.image) ||
      !fs.existsSync(options.image) ||
      !fs.statSync(options.image).isFile()
    ) {
      throw new Error('Invalid image');
    }

    const fileName = path.basename(options.image);
    const dataId = nanoid();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.providerEntity.apiKey}`,
      'Accept': '*/*'
    }

    // Step 1: 申请上传地址
    const urlRes = await fetch(`${this.baseUrl}/v4/file-urls/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        "files": [
          {
            "name": fileName,
            "data_id": dataId
          }
        ],
        "model_version": this.modelId,
      }),
    });

    if (!urlRes.ok) {
      throw new Error(`Failed to request upload URLs: ${urlRes.status}`);
    }

    const urlResult = await urlRes.json();
    if (urlResult.code !== 0) {
      throw new Error(
        `Failed to get upload URLs: ${urlResult.msg ?? JSON.stringify(urlResult)}`,
      );
    }

    const batchId: string = urlResult.data.batch_id;
    const fileUrls: string[] = urlResult.data.file_urls;

    // Step 2: 上传文件到预签名 URL
    const buf = await fs.promises.readFile(options.image);
    const uploadRes = await fetch(fileUrls[0], {
      method: 'PUT',
      body: new Uint8Array(buf),
    });

    if (!uploadRes.ok) {
      throw new Error(`File upload failed: ${uploadRes.status}`);
    }

    // Step 3: 轮询获取提取结果
    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const resultRes = await fetch(
        `${this.baseUrl}/v4/extract-results/batch/${batchId}`,
        { headers },
      );

      if (!resultRes.ok) {
        throw new Error(
          `Failed to get extract results: ${resultRes.status}`,
        );
      }

      const resultData = await resultRes.json();
      if (resultData.code !== 0) {
        continue;
      }

      const extractResults = resultData.data?.extract_result;
      if (!extractResults || extractResults.length === 0) {
        continue;
      }

      const item = extractResults.find(
        (r: any) => r.data_id === dataId,
      );
      if (!item) {
        continue;
      }

      if (item.state === 'done') {
        if (item.full_text) {
          return item.full_text;
        }

        const zipUrl: string | undefined =
          item.full_zip_url ?? item.content_url;
        if (zipUrl) {
          return await this.downloadAndExtractMarkdown(zipUrl);
        }

        return JSON.stringify(item);
      }

      if (item.state === 'failed') {
        throw new Error(
          `MinerU extraction failed: ${item.err_msg ?? 'unknown error'}`,
        );
      }
    }

    throw new Error('MinerU extraction timed out');
  }

  private async downloadAndExtractMarkdown(zipUrl: string): Promise<string> {
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'mineru-'),
    );

    const res = await fetch(zipUrl);
    if (!res.ok) {
      throw new Error(`Failed to download zip: ${res.status}`);
    }

    const zipBuf = Buffer.from(await res.arrayBuffer());
    const zipPath = path.join(tmpDir, 'result.zip');
    await fs.promises.writeFile(zipPath, zipBuf);

    const extractDir = path.join(tmpDir, 'extracted');
    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .promise();

    await fs.promises.unlink(zipPath).catch(() => { });

    const mdPath = await this.findFile(extractDir, 'full.md');
    if (!mdPath) {
      throw new Error('full.md not found in extracted zip');
    }

    const mdDir = path.dirname(mdPath);
    let content = await fs.promises.readFile(mdPath, 'utf-8');

    content = content.replace(
      /!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/)([^)]+)\)/g,
      (_, alt, relativePath) => {
        const absPath = path.resolve(mdDir, relativePath);
        return `<div style="text-align: center;"><img src="${`file://${absPath}`}" alt="Image" width="50%" /></div>`
        return `![${alt}](file://${absPath})`;
      },
    );

    return content;
  }

  private async findFile(
    dir: string,
    target: string,
  ): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await this.findFile(fullPath, target);
        if (found) return found;
      } else if (entry.name === target) {
        return fullPath;
      }
    }
    return null;
  }
}
export class MineruProvider extends BaseProvider {

  name: string = 'mineru';
  type: ProviderType = ProviderType.MINERU;
  tags: ProviderTag[] = [ProviderTag.OCR];
  description: string;
  defaultApiBase?: string;
  hasChatModel = false;

  constructor(provider: Providers) {
    super({ provider });
  }

  languageModel(modelId: string): LanguageModelV2 {
    return undefined;
  }

  async getLanguageModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getEmbeddingModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }
  async getRerankModelList(): Promise<{ name: string; id: string }[]> {
    return [];
  }

  async getOCRModelList(): Promise<{ name: string; id: string; }[]> {
    return [{ id: 'pipeline', name: 'MinerU Pipeline' },
    { id: 'vlm', name: 'MinerU VLM' },
    { id: 'MinerU-HTML', name: 'MinerU HTML' }
    ];
  }

  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string> {
    return undefined;
  }
  imageModel(modelId: string): ImageModelV2 {
    return undefined;
  }
  transcriptionModel?(modelId: string): TranscriptionModelV2 {
    return undefined;
  }
  speechModel?(modelId: string): SpeechModelV2 {
    return undefined;
  }
  ocrModel(modelId: string): OCRModel {
    return new MineruOCRModel(modelId, this.provider);
  }
}
