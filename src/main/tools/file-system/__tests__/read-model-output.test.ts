import { toReadModelOutput } from '../read-model-output';

describe('toReadModelOutput', () => {
  it('returns text output for text and error results', () => {
    expect(toReadModelOutput('file contents')).toEqual({
      type: 'text',
      value: 'file contents',
    });
    expect(
      toReadModelOutput(
        '<system-reminder>Error: File does not exist.</system-reminder>',
      ),
    ).toEqual({
      type: 'text',
      value: '<system-reminder>Error: File does not exist.</system-reminder>',
    });
  });

  it('maps Aime image content to documented multimodal output', () => {
    const rawResult = {
      content: [
        { type: 'text', text: 'Image metadata' },
        {
          type: 'image',
          data: 'aW1hZ2U=',
          mimeType: 'image/png',
        },
      ],
    };

    expect(toReadModelOutput(rawResult)).toEqual({
      type: 'content',
      value: [
        { type: 'text', text: 'Image metadata' },
        {
          type: 'image-data',
          data: 'aW1hZ2U=',
          mediaType: 'image/png',
        },
      ],
    });
    expect(rawResult.content[1]).toEqual({
      type: 'image',
      data: 'aW1hZ2U=',
      mimeType: 'image/png',
    });
  });

  it('normalizes data URLs and file media without double wrapping', () => {
    expect(
      toReadModelOutput([
        {
          type: 'image-data',
          data: 'data:image/webp;base64,d2VicA==',
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
          data: 'd2VicA==',
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

  it('preserves non-multimodal structured results as JSON', () => {
    const output = { pages: 2, extracted: true };

    expect(toReadModelOutput(output)).toEqual({
      type: 'json',
      value: output,
    });
  });

  it('accepts the tool-output envelope used by newer AI SDK adapters', () => {
    expect(
      toReadModelOutput({
        toolCallId: 'call_read',
        input: { file_path: '/tmp/image.png' },
        output: {
          content: [
            {
              type: 'image',
              data: 'aW1hZ2U=',
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
          data: 'aW1hZ2U=',
          mediaType: 'image/png',
        },
      ],
    });
  });
});
