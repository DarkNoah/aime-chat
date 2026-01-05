import { BaseLoader } from './base-loader';
import * as xlsx from 'xlsx';
import fs from 'fs';
export type ExcelLoaderOptions = {
  maxRow?: number;
};
export class ExcelLoader extends BaseLoader {
  options: ExcelLoaderOptions;
  constructor(filePathOrBlob: string | Blob, options?: ExcelLoaderOptions) {
    super(filePathOrBlob);
    this.options = { maxRow: 15, ...(options ?? {}) };
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    // const metadata = {};
    let wb: xlsx.WorkBook;
    xlsx.set_fs(fs);
    if (this.filePathOrBlob instanceof Blob) {
      const arrayBuffer = await this.filePathOrBlob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      wb = xlsx.read(data, { type: 'array' });
    } else {
      wb = xlsx.readFile(this.filePathOrBlob);
      metadata['source'] = this.filePathOrBlob;
    }
    const docs: {
      id: string;
      pageContent: string;
      metadata: Record<string, any>;
    }[] = [];
    for (const sheetName of wb.SheetNames) {
      const worksheet = wb.Sheets[sheetName];

      let row = worksheet['!rows']?.length;
      if (row === undefined) {
        const result = worksheet['!ref'].split(':')[1].match(/\d+$/)?.[0] || '';
        row = parseInt(result, 10);
      }
      metadata['rowCount'] = row;

      const data = xlsx.utils.sheet_to_txt(worksheet);
      let pageContent = data;

      if (this.options.maxRow < 15) {
        this.options.maxRow = 15;
      }

      if (
        this.options.maxRow &&
        data.split('\n').length > this.options.maxRow
      ) {
        pageContent = data.split('\n').slice(0, 5).join('\n');
        pageContent += `\n\n...[the data is too large]...\n\n`;
        pageContent += data
          .split('\n')
          .slice(data.split('\n').length - 5, data.split('\n').length)
          .join('\n');
      }
      // debugger;
      // const pageContent = data.map((x) => JSON.stringify(x)).join('\n\n');
      docs.push({ id: sheetName, pageContent: pageContent, metadata });
    }
    return docs;
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }
}
