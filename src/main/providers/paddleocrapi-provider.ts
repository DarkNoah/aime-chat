import { Providers } from "@/entities/providers";
import { BaseProvider, OCRModel } from "./base-provider";
import { ProviderCredits, ProviderTag, ProviderType } from "@/types/provider";
import fs from 'fs';
import path from "path";

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
    const data = await res.json()
    if (data.errorCode)
      throw new Error(data.errorMsg);




    return data.result.layoutParsingResults.map(x => x.markdown.text).join('\n\n');
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
