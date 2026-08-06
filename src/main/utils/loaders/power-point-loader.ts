import { BaseLoader } from './base-loader';
import { parseOfficeAsync } from 'officeparser';
import { toDocument, toMarkdown, toMarkdownBytes } from '@firecrawl/anydoc';

export class PowerPointLoader extends BaseLoader {
  constructor(filePathOrBlob: string | Blob) {
    super(filePathOrBlob);
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<string> {
    return toMarkdownBytes(raw);
    const pptx = await parseOfficeAsync(raw, { outputErrorToConsole: true });
    return pptx;
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }
}
