import fs from 'fs';
import sharp from 'sharp';
import { pdf } from 'pdf-to-img';
import path from 'path';
import { getAssetPath } from '.';

export type PdfToImageBase64Input = string | Buffer | Uint8Array | ArrayBuffer;

export interface PdfToImageBase64Options {
  pages?: number[];
  scale?: number;
  desiredWidth?: number;
}

export interface PdfImageBase64Result {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  mimeType: string;
  base64: string;
  dataUrl: string;
}

const DATA_URL_PREFIX_RE = /^data:([^;]+);base64,/i;

const toBuffer = async (input: PdfToImageBase64Input): Promise<Buffer> => {
  if (typeof input === 'string') {
    return fs.promises.readFile(input);
  }

  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }

  return Buffer.from(input);
};

const toImageResult = async (
  pageNumber: number,
  imageBuffer: Buffer,
  scale: number,
  desiredWidth?: number,
): Promise<PdfImageBase64Result> => {
  const outputBuffer = desiredWidth
    ? await sharp(imageBuffer).resize({ width: desiredWidth }).png().toBuffer()
    : imageBuffer;
  const metadata = await sharp(outputBuffer).metadata();
  const base64 = outputBuffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;
  const match = dataUrl.match(DATA_URL_PREFIX_RE);

  return {
    pageNumber,
    width: metadata.width || 0,
    height: metadata.height || 0,
    scale,
    mimeType: match?.[1] || 'image/png',
    base64,
    dataUrl,
  };
};

export async function pdfToImageBase64(
  input: PdfToImageBase64Input,
  options: PdfToImageBase64Options = {},
): Promise<PdfImageBase64Result[]> {
  const { pages, scale = 2, desiredWidth } = options;
  const raw = await toBuffer(input);
  const pdfjsWasmDir = getAssetPath('pdfjs-dist', 'wasm');
  const document = await pdf(raw, {
    scale, docInitParams: {
      useWasm: true,
      wasmUrl: `${pdfjsWasmDir.replace(/\\/g, '/')}/`
    }
  });

  if (pages?.length) {
    return Promise.all(
      pages.map(async (pageNumber) => {
        const imageBuffer = await document.getPage(pageNumber);
        return toImageResult(pageNumber, imageBuffer, scale, desiredWidth);
      }),
    );
  }

  const imageBuffers: Buffer[] = [];
  let pageNumber = 1;
  for await (const imageBuffer of document) {
    imageBuffers.push(imageBuffer);
    pageNumber += 1;
  }

  return Promise.all(
    imageBuffers.map((imageBuffer, index) =>
      toImageResult(index + 1, imageBuffer, scale, desiredWidth),
    ),
  );
}
