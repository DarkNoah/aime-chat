import { OcrAccuracy, recognize } from '@napi-rs/system-ocr';
import { BaseLoader } from './base-loader';
import { type ParseParameters } from 'pdf-parse';

export type PDFLoaderOptions = ParseParameters & {
  splitPages?: boolean;
  parsedItemSeparator?: string;
};
export class PDFLoader extends BaseLoader {
  protected options: PDFLoaderOptions;

  constructor(filePathOrBlob: string | Blob, options?: PDFLoaderOptions) {
    super(filePathOrBlob);
    this.options = options || { splitPages: true, parsedItemSeparator: '' };
    // this.filePathOrBlob = filePathOrBlob;
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<string> {
    // const { default: mod } =
    //   await import('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
    // const { getDocument, version } = mod;
    const pdfjs = await import('pdf-parse');
    const pdf = new pdfjs.PDFParse({
      data: new Uint8Array(raw.buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    // const info = await pdf.getInfo();
    // console.log(info);
    // const pdf = await pdfjs.getDocument({
    //   data: new Uint8Array(raw.buffer),
    //   useWorkerFetch: false,
    //   isEvalSupported: false,
    //   useSystemFonts: true,
    // }).promise;
    // const meta = await pdf.getMetadata().catch(() => null);

    const documents: string[] = [];
    const content = await pdf.getText(this.options || {});
    let text = '';
    if (
      content.pages.filter((page) => !page.text.trim()).length ==
      content.pages.length
    ) {
      const images = await pdf.getImage({ imageBuffer: true });

      for (const page of images.pages) {
        for (const image of page.images) {
          const imageBuffer = image.data;
          const result = await recognize(imageBuffer, OcrAccuracy.Accurate);
          text += result.text;
        }
        text += `\n\n-- ${page.pageNumber} of ${images.total} --\n\n`;
      }
    } else {
      text = content.text;
    }
    await pdf.destroy();
    return text;

    // for (let i = 1; i <= info.total; i += 1) {
    //   const content = await pdf.getText({ partial: [i] });
    //   // const content = await page.getTextContent();

    //   if (content. === 0) {
    //     continue;
    //   }

    //   // Eliminate excessive newlines
    //   // Source: https://github.com/albertcui/pdf-parse/blob/7086fc1cc9058545cdf41dd0646d6ae5832c7107/lib/pdf-parse.js#L16
    //   let lastY;
    //   const textItems = [];
    //   for (const item of content.items) {
    //     if ('str' in item) {
    //       if (lastY === item.transform[5] || !lastY) {
    //         textItems.push(item.str);
    //       } else {
    //         textItems.push(`\n${item.str}`);
    //       }
    //       // eslint-disable-next-line prefer-destructuring
    //       lastY = item.transform[5];
    //     }
    //   }

    //   const text = textItems.join(this.options.parsedItemSeparator);

    //   documents.push(text);
    // }
    // return documents.join('\n');
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    throw new Error('Method not implemented.');
  }
}
