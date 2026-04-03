import { Providers } from "@/entities/providers";
import { BaseProvider, OCRModel } from "./base-provider";
import { ProviderCredits, ProviderTag, ProviderType } from "@/types/provider";
import fs from 'fs';
import path from "path";
import os from 'os';
import { createHash } from "crypto";
import { pdfToImageBase64 } from "../utils/pdf";
export class PaddleOcrApiModel implements OCRModel {
  provider: string = 'paddleocrapi';
  modelId: string;
  providerEntity: Providers;
  constructor(provider: Providers) {
    this.providerEntity = provider;
  }

  async doOCR(options: { image: string, excludeInsideImage?: boolean, abortSignal?: AbortSignal }): Promise<string> {
    const image = fs.readFileSync(options.image);
    const excludeInsideImage = options.excludeInsideImage ?? false;
    let fileType = 1;
    if (path.extname(options.image).toLowerCase() === '.pdf') {
      fileType = 0;
    }

    const headers = {
      'Content-Type': 'application/json',
    }
    if (this.providerEntity.apiKey) {
      headers['Authorization'] = `Bearer ${this.providerEntity.apiKey}`;
    }

    let data;
    if (fileType === 0) {
      const pages = await pdfToImageBase64(image, {
        scale: 2,
      });

      for (const page of pages) {
        // const tmpPath = path.join(os.tmpdir(), 'paddleocrapi-cache', `${page.pageNumber}.png`)
        // fs.writeFileSync(tmpPath, Buffer.from(page.base64, 'base64'));
        const res = await fetch(`${this.providerEntity.apiBase}/layout-parsing`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            "file": page.base64,
            "fileType": 1,
          }),
          signal: options?.abortSignal,
        });
        // await fs.promises.rm(tmpPath);
        if (options?.abortSignal?.aborted) {
          throw new Error('OCR was cancelled by user before it could complete.');
        }
        const _data = await res.json()
        if (_data.errorCode)
          throw new Error(_data.errorMsg);
        if (!data) {
          data = _data
        } else {
          data.result.layoutParsingResults.push(..._data.result.layoutParsingResults)
        }
      }
    } else {
      const image_data = image.toString('base64');
      const res = await fetch(`${this.providerEntity.apiBase}/layout-parsing`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          "file": image_data,
          "fileType": fileType,
        }),
        signal: options?.abortSignal,
      });
      if (options?.abortSignal?.aborted) {
        throw new Error('OCR was cancelled by user before it could complete.');
      }
      data = await res.json()
      if (data.errorCode)
        throw new Error(data.errorMsg);
    }










    return data.result.layoutParsingResults.map(x => {
      if (excludeInsideImage) {
        const text = x.markdown.text.replace(
          /<img\b[^>]*\/?>/gi,
          ""
        );

        return text;
      } else {
        const { images = [] } = x.markdown;
        const cachePath = path.join(os.tmpdir(), 'paddleocrapi-cache');
        let text = x.markdown.text
        for (const [key, base64Str] of Object.entries(images) as [string, string][]) {
          const md5Hash = createHash('md5').update(base64Str).digest('hex');
          const imagePath = path.join(cachePath, md5Hash + path.extname(key));
          fs.mkdirSync(path.dirname(imagePath), { recursive: true });
          const imageData = Buffer.from(base64Str as string, 'base64');
          fs.writeFileSync(imagePath, imageData);
          text = text.replaceAll(' src="' + key + '"', ` src="file://${imagePath.replaceAll('\\', '/')}"`);
        }
        return text;
      }
    }).join('\n\n');
  }

}




export class PaddleOcrApiProvider extends BaseProvider {
  name: string = 'paddleocrapi';
  type: ProviderType = ProviderType.PADDLEOCRAPI;
  description: string;
  // defaultApiBase?: string = 'https://api.paddleocrapi.com';
  defaultApiBase?: string;

  constructor(provider: Providers) {
    super({ provider });
  }

  getLanguageModelList(): Promise<{ name: string; id: string; }[]> {
    return Promise.resolve([]);
  }
  getEmbeddingModelList(): Promise<{ name: string; id: string; }[]> {
    return Promise.resolve([]);
  }
  getRerankModelList(): Promise<{ name: string; id: string; }[]> {
    return Promise.resolve([]);
  }
  getCredits(): Promise<ProviderCredits | undefined> {
    return undefined;
  }

  async getOCRModelList(): Promise<{ name: string; id: string; }[]> {
    return [
      { id: 'paddleocr', name: 'PaddleOCR' }
    ];
  }

  ocrModel(modelId: string): OCRModel {
    return new PaddleOcrApiModel(this.provider);
  }
}
