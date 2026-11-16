/** @jest-environment node */
import sharp from 'sharp';
import { MAX_READ_IMAGE_PIXELS, resizeReadImageData } from '../read-image';

async function makeImage(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
}

describe('resizeReadImageData', () => {
  it.each([
    ['landscape', 4096, 2304],
    ['portrait', 2304, 4096],
    ['square', 3000, 3000],
    ['panorama', 12000, 800],
  ])(
    'bounds an oversized %s image while retaining its ratio',
    async (_, width, height) => {
      const inputWidth = width as number;
      const inputHeight = height as number;
      const original = await makeImage(inputWidth, inputHeight);
      const output = await resizeReadImageData(
        original.toString('base64'),
        'image/png',
      );
      const metadata = await sharp(
        Buffer.from(output.data, 'base64'),
      ).metadata();

      expect(output.mediaType).toBe('image/png');
      expect(metadata.width * metadata.height).toBeLessThanOrEqual(
        MAX_READ_IMAGE_PIXELS,
      );
      expect(metadata.width).toBeLessThan(inputWidth);
      expect(metadata.height).toBeLessThan(inputHeight);
      expect(
        Math.abs(metadata.height - (metadata.width * inputHeight) / inputWidth),
      ).toBeLessThanOrEqual(2);
    },
  );

  it.each([
    [3840, 2160],
    [5000, 1000],
    [64, 32],
  ])(
    'preserves original bytes at or below the area limit (%i x %i)',
    async (width, height) => {
      const original = await makeImage(width, height);
      const data = original.toString('base64');

      await expect(resizeReadImageData(data, 'image/png')).resolves.toEqual({
        data,
        mediaType: 'image/png',
      });
    },
  );

  it('retains transparency when resizing', async () => {
    const original = await sharp({
      create: {
        width: 4000,
        height: 2200,
        channels: 4,
        background: { r: 20, g: 100, b: 200, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const output = await resizeReadImageData(
      original.toString('base64'),
      'image/png',
    );
    const decoded = sharp(Buffer.from(output.data, 'base64'));

    expect((await decoded.metadata()).hasAlpha).toBe(true);
    const pixel = await decoded
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect(pixel[3]).toBe(128);
  });

  it('applies EXIF orientation and returns matching PNG data and media type', async () => {
    const original = await sharp({
      create: { width: 4500, height: 2000, channels: 3, background: 'blue' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const output = await resizeReadImageData(
      original.toString('base64'),
      'image/jpeg',
    );
    const metadata = await sharp(Buffer.from(output.data, 'base64')).metadata();

    expect(output.mediaType).toBe('image/png');
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(4320);
    expect(metadata.width * metadata.height).toBe(MAX_READ_IMAGE_PIXELS);
    expect(metadata.orientation).toBeUndefined();
  });
});
