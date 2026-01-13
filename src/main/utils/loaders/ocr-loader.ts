import { OcrAccuracy, recognize } from '@napi-rs/system-ocr';
import { BaseLoader } from './base-loader';
import fs from 'fs';
export type OcrLoaderOptions = {
  mode: 'system' | 'paddle' | 'mineru-api';
};
export class OcrLoader extends BaseLoader {
  options: OcrLoaderOptions;
  constructor(filePathOrBlob: string | Blob, options?: OcrLoaderOptions) {
    super(filePathOrBlob);
    this.options = { mode: 'system', ...(options ?? {}) };
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    if (this.options.mode === 'system') {
      const result = await recognize(raw, OcrAccuracy.Accurate);
      return result.text;
    }
    return '';
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }
}
