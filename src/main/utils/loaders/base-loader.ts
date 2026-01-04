import fs from 'fs';

export abstract class BaseLoader {
  filePathOrBlob: string | Blob;
  // abstract load(): Promise<Document[]>{

  // }

  constructor(filePathOrBlob: string | Blob) {
    this.filePathOrBlob = filePathOrBlob;
  }

  abstract parse(
    buffer: Buffer,
    metadata: Record<string, any>,
  ): Promise<string>;

  abstract getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any>;

  async load(): Promise<string> {
    let buffer;
    let metadata;
    if (typeof this.filePathOrBlob === 'string') {
      buffer = await await fs.promises.readFile(this.filePathOrBlob);
      metadata = { source: this.filePathOrBlob };
    } else {
      buffer = await this.filePathOrBlob
        .arrayBuffer()
        .then((ab) => Buffer.from(ab));
      metadata = { source: 'blob', blobType: this.filePathOrBlob.type };
    }
    return this.parse(buffer, metadata);
  }

  async info(): Promise<any> {
    let buffer;
    let metadata;
    if (typeof this.filePathOrBlob === 'string') {
      buffer = await await fs.promises.readFile(this.filePathOrBlob);
      metadata = { source: this.filePathOrBlob };
    } else {
      buffer = await this.filePathOrBlob
        .arrayBuffer()
        .then((ab) => Buffer.from(ab));
      metadata = { source: 'blob', blobType: this.filePathOrBlob.type };
    }
    return this.getInfo(buffer, metadata);
  }
  // loadAndSplit(splitter?: BaseDocumentTransformer): Promise<Document[]>;
}
