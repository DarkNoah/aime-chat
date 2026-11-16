/** @jest-environment node */
import sharp from 'sharp';
import { toReadModelOutput } from '../read-model-output';

describe('toReadModelOutput', () => {
  let png: string;
  let webp: string;

  beforeAll(async () => {
    const image = sharp({
      create: { width: 16, height: 8, channels: 4, background: '#33669980' },
    });
    png = (await image.clone().png().toBuffer()).toString('base64');
    webp = (await image.clone().webp().toBuffer()).toString('base64');
  });

  it('returns text output for text and error results', async () => {
    expect(await toReadModelOutput('file contents')).toEqual({
      type: 'text',
      value: 'file contents',
    });
    expect(
      await toReadModelOutput(
        '<system-reminder>Error: File does not exist.</system-reminder>',
      ),
    ).toEqual({
      type: 'text',
      value: '<system-reminder>Error: File does not exist.</system-reminder>',
    });
  });

  it('maps Aime image content to documented multimodal output', async () => {
    const rawResult = {
      content: [
        { type: 'text', text: 'Image metadata' },
        {
          type: 'image',
          data: png,
          mimeType: 'image/png',
        },
      ],
    };

    expect(await toReadModelOutput(rawResult)).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'Image metadata' },
        {
          type: 'image-data',
          data: png,
          mediaType: 'image/png',
        },
      ],
    });
    expect(rawResult.content[1]).toEqual({
      type: 'image',
      data: png,
      mimeType: 'image/png',
    });
  });

  it('normalizes data URLs and file media without double wrapping', async () => {
    expect(
      await toReadModelOutput([
        {
          type: 'image-data',
          data: `data:image/webp;base64,${webp}`,
          mediaType: 'image/jpeg',
        },
        {
          type: 'video',
          data: 'dmlkZW8=',
          mimeType: 'video/mp4',
        },
      ]),
    ).toEqual({
      type: 'content',
      value: [
        {
          type: 'image-data',
          data: webp,
          mediaType: 'image/webp',
        },
        {
          type: 'file-data',
          data: 'dmlkZW8=',
          mediaType: 'video/mp4',
        },
      ],
    });
  });

  it('preserves non-multimodal structured results as JSON', async () => {
    const output = { pages: 2, extracted: true };

    expect(await toReadModelOutput(output)).toEqual({
      type: 'json',
      value: output,
    });
  });

  it('accepts the tool-output envelope used by newer AI SDK adapters', async () => {
    expect(
      await toReadModelOutput({
        toolCallId: 'call_read',
        input: { file_path: '/tmp/image.png' },
        output: {
          content: [
            {
              type: 'image',
              data: png,
              mimeType: 'image/png',
            },
          ],
        },
      }),
    ).toEqual({
      type: 'content',
      value: [
        {
          type: 'image-data',
          data: png,
          mediaType: 'image/png',
        },
      ],
    });
  });

  it.each(['image', 'data-url', 'tagged-file'])(
    'limits %s image data only in model output and preserves the raw result',
    async (shape) => {
      const data = (
        await sharp({
          create: {
            width: 6000,
            height: 2000,
            channels: 4,
            background: '#33669980',
          },
        })
          .png()
          .toBuffer()
      ).toString('base64');
      const imagePart = {
        image: { type: 'image', data, mimeType: 'image/png' },
        'data-url': {
          type: 'image-data',
          data: `data:image/png;base64,${data}`,
          mediaType: 'image/jpeg',
        },
        'tagged-file': {
          type: 'file',
          data: { type: 'data', data },
          mediaType: 'image/png',
        },
      }[shape];
      const rawResult = {
        content: [
          { type: 'text', text: 'Original image: 6000x2000 pixels' },
          imagePart,
          {
            type: 'image-url',
            url: 'https://example.com/image.png',
            mediaType: 'image/png',
          },
          { type: 'video', data: 'dmlkZW8=', mimeType: 'video/mp4' },
        ],
      };
      const original = JSON.stringify(rawResult);

      const result = await toReadModelOutput(rawResult);

      expect(JSON.stringify(rawResult)).toBe(original);
      expect(result.type).toBe('content');
      if (result.type !== 'content') throw new Error('Expected image content');
      expect(result.value[0]).toEqual(rawResult.content[0]);
      expect(result.value[2]).toEqual(rawResult.content[2]);
      expect(result.value[3]).toEqual({
        type: 'file-data',
        data: 'dmlkZW8=',
        mediaType: 'video/mp4',
      });
      const image = result.value[1];
      if (image.type !== 'image-data') throw new Error('Expected inline image');
      expect(image.mediaType).toBe('image/png');
      expect(image.data).not.toBe(data);
      const metadata = await sharp(
        Buffer.from(image.data, 'base64'),
      ).metadata();
      expect(metadata.width! * metadata.height!).toBeLessThanOrEqual(8_294_400);
      expect(metadata.width).toBeGreaterThan(4096);
      expect(
        Math.abs(metadata.width! - metadata.height! * 3),
      ).toBeLessThanOrEqual(3);
    },
  );
});
