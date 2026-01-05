import { BaseLoader } from './base-loader';
import { parseOfficeAsync } from 'officeparser';

export class PowerPointLoader extends BaseLoader {
  constructor(filePathOrBlob: string | Blob) {
    super(filePathOrBlob);
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<string> {
    const pptx = await parseOfficeAsync(raw, { outputErrorToConsole: true });
    return pptx;
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }
}
