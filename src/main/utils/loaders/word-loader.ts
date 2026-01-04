import { BaseLoader } from './base-loader';

export type DocxLoaderOptions = {
  type: 'docx' | 'doc';
};

export class WordLoader extends BaseLoader {
  protected options: DocxLoaderOptions;

  constructor(filePathOrBlob: string | Blob, options?: DocxLoaderOptions) {
    super(filePathOrBlob);
    this.options = options || { type: 'docx' };
    // this.filePathOrBlob = filePathOrBlob;
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<string> {
    if (this.options.type === 'doc') {
      return this.parseDoc(raw, metadata);
    }
    return this.parseDocx(raw, metadata);
  }

  async getInfo(raw: Buffer, metadata: Record<string, any>) {
    const WordExtractor = await DocLoaderImports();
    const extractor = new WordExtractor();
    const doc = await extractor.extract(raw);
    // const _metadata = doc.getMetadata();
    debugger;

    // if (this.options.type === 'doc') {
    //   const WordExtractor = await DocLoaderImports();
    //   const extractor = new WordExtractor();
    //   const doc = await extractor.extract(raw);
    //   const metadata = extractor.getMetadata();
    //   return;
    // } else {
    //   const { extractRawText } = await DocxLoaderImports();
    //   const docx = await extractRawText({
    //     buffer: raw,
    //   });
    //   const metadata = getMetadata();
    // }
    return {
      type: this.options.type,
    };
  }

  async parseDocx(raw, metadata) {
    if (this.options.type === 'doc') {
      return this.parseDoc(raw, metadata);
    }
    const { extractRawText } = await DocxLoaderImports();
    const docx = await extractRawText({
      buffer: raw,
    });
    if (!docx.value) return [];
    return docx.value;
  }
  async parseDoc(raw, metadata) {
    const WordExtractor = await DocLoaderImports();
    const extractor = new WordExtractor();
    const doc = await extractor.extract(raw);
    return doc.getBody();
  }
}

async function DocxLoaderImports() {
  try {
    const { extractRawText } = await import('mammoth');
    return { extractRawText };
  } catch (e) {
    console.error(e);
    throw new Error(
      'Failed to load mammoth. Please install it with eg. `npm install mammoth`.',
    );
  }
}
async function DocLoaderImports() {
  try {
    const WordExtractor = await import('word-extractor');
    return WordExtractor.default;
  } catch (e) {
    console.error(e);
    throw new Error(
      'Failed to load word-extractor. Please install it with eg. `npm install word-extractor`.',
    );
  }
}
