import type { ModelMessage } from 'ai';
import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import {
  filterImagesBeforeSend,
  IMAGE_PLACEHOLDER,
  replaceImagesForCompression,
} from '../message-image-filter';
import { messageImagesProcessor } from '../../mastra/processors/message-images';
import { filterFilePartsForModel } from '../messageUtils';

const image = (label: string) => ({
  type: 'image' as const,
  image: `data:image/png;base64,${Buffer.from(label).toString('base64')}`,
});
const text = (value = 'text') => ({ type: 'text' as const, text: value });
const omitted = text(IMAGE_PLACEHOLDER);
const user = (...content: any[]): ModelMessage => ({ role: 'user', content });
const assistant = (): ModelMessage => ({ role: 'assistant', content: 'reply' });
const tool = (id: string, ...content: any[]): ModelMessage => ({
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: id,
      toolName: 'Read',
      output: { type: 'json', value: { content } },
    },
  ],
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('filterImagesBeforeSend', () => {
  it('matches the requested history, keeping the latest user and tool block', () => {
    const messages = deepFreeze([
      user(image('old user')),
      tool('1', image('old tool 1')),
      tool('2', image('old tool 2')),
      user(text()),
      assistant(),
      tool('3', image('old tool 3')),
      assistant(),
      tool('4', image('latest tool')),
      tool('5', text('tool xxx')),
      assistant(),
      user(image('latest user')),
    ]);
    expect(filterImagesBeforeSend(messages)).toEqual([
      user(omitted),
      tool('1', omitted),
      tool('2', omitted),
      messages[3],
      messages[4],
      tool('3', omitted),
      ...messages.slice(6),
    ]);
    expect(messages[0]).toEqual(user(image('old user')));
  });

  it('retains only the newest 10 inline images across users, tools and parts', () => {
    const toolImages = Array.from({ length: 8 }, (_, i) => image(`tool ${i}`));
    const userImages = Array.from({ length: 5 }, (_, i) => image(`user ${i}`));
    const messages = [
      tool('1', ...toolImages.slice(0, 4)),
      tool('2', ...toolImages.slice(4)),
      assistant(),
      user(...userImages),
    ];
    expect(filterImagesBeforeSend(messages)).toEqual([
      tool('1', omitted, omitted, omitted, toolImages[3]),
      ...messages.slice(1),
    ]);
    expect(
      filterImagesBeforeSend([user(...toolImages, ...userImages)]),
    ).toEqual([
      user(omitted, omitted, omitted, ...toolImages.slice(3), ...userImages),
    ]);
  });

  it('does not search older users or tool blocks when the newest has no image', () => {
    expect(
      filterImagesBeforeSend([
        user(image('old user')),
        tool('1', image('old tool')),
        assistant(),
        tool('2', text()),
        user(text()),
      ]),
    ).toEqual([
      user(omitted),
      tool('1', omitted),
      assistant(),
      tool('2', text()),
      user(text()),
    ]);
  });

  it('ends the latest tool block at a user boundary and clears assistant images', () => {
    const messages = [
      tool('1', image('old')),
      user(image('user')),
      tool('2', image('latest')),
      {
        role: 'assistant',
        content: [{ type: 'file', data: 'aW1hZ2U=', mediaType: 'image/png' }],
      },
    ] as ModelMessage[];
    expect(filterImagesBeforeSend(messages)).toEqual([
      tool('1', omitted),
      messages[1],
      messages[2],
      { role: 'assistant', content: [omitted] },
    ]);
  });

  it('does not count URL/path references and handles raw JPEG base64 correctly', () => {
    const references = [
      { type: 'image', image: new URL('https://example.com/image.png') },
      { type: 'image', image: '/tmp/image.png' },
    ];
    const inline = Array.from({ length: 10 }, (_, i) => image(String(i)));
    expect(
      filterImagesBeforeSend([
        user({ type: 'image', image: '/9j/AAAA' }, ...references, ...inline),
      ]),
    ).toEqual([user(omitted, ...references, ...inline)]);
  });

  it('handles SDK, MCP and binary images with one shared budget', () => {
    const parts = [
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      { type: 'image-data', data: 'aW1hZ2U=', mediaType: 'image/png' },
      { type: 'media', data: 'aW1hZ2U=', mediaType: 'image/png' },
      { type: 'file', data: Buffer.from('image'), mediaType: 'image/png' },
      { type: 'file', data: new Uint8Array([1, 2]), mediaType: 'image/png' },
      {
        type: 'file',
        data: { type: 'data', data: 'aW1hZ2U=' },
        mediaType: 'image/png',
      },
      { type: 'image-url', url: 'data:image/png;base64,aW1hZ2U=' },
    ];
    const latestImages = Array.from({ length: 5 }, (_, i) => image(String(i)));
    expect(
      filterImagesBeforeSend([
        tool('1', ...parts),
        assistant(),
        user(...latestImages),
      ]),
    ).toEqual([
      tool('1', omitted, omitted, ...parts.slice(2)),
      assistant(),
      user(...latestImages),
    ]);
  });

  it('leaves ordinary files, text and tool-call input intact', () => {
    const messages = deepFreeze([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: '1',
            toolName: 'Example',
            input: { type: 'image', data: 'argument' },
          },
        ],
      },
      user(text(), {
        type: 'file',
        data: 'cGRm',
        mediaType: 'application/pdf',
      }),
      tool('1', { type: 'audio', data: 'YXVkaW8=', mimeType: 'audio/wav' }),
    ] as ModelMessage[]);
    expect(filterImagesBeforeSend(messages)).toEqual(messages);
    expect(replaceImagesForCompression(messages)).toEqual(messages);
    expect(filterImagesBeforeSend([])).toEqual([]);
  });

  it('filters the final provider prompt without changing the original request', () => {
    const prompt: LanguageModelV2Prompt = deepFreeze([
      {
        role: 'user',
        content: [{ type: 'file', data: 'aW1hZ2U=', mediaType: 'image/png' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'next' }] },
    ]);
    const result = messageImagesProcessor.processLLMRequest({ prompt });
    expect(result.prompt).toEqual([
      { role: 'user', content: [omitted] },
      ...prompt.slice(1),
    ]);
    expect(prompt[0]).toMatchObject({ content: [{ type: 'file' }] });
  });
});

describe('replaceImagesForCompression', () => {
  it.each([false, true])(
    'keeps images as text with vision=%s while retaining other media compatibility',
    (supportsVision) => {
      const pdf = { type: 'file', data: 'cGRm', mediaType: 'application/pdf' };
      const source = deepFreeze([user(image('inline'), pdf)]);
      expect(
        filterFilePartsForModel(
          replaceImagesForCompression(source),
          supportsVision,
        ),
      ).toEqual([user(omitted, ...(supportsVision ? [pdf] : []))]);
      expect(source[0]).toEqual(user(image('inline'), pdf));
    },
  );

  it('converts every image to a text reference or placeholder, with no vision exception', () => {
    const messages = deepFreeze([
      user(
        image('inline'),
        {
          type: 'file',
          data: 'aW1hZ2U=',
          mediaType: 'image/png',
          path: '/tmp/local.png',
        },
        { type: 'image', image: new URL('file:///tmp/Chinese%20image.png') },
        { type: 'image', image: new URL('https://example.com/image.png') },
        { type: 'image', image: 'C:\\images\\test.png' },
        { type: 'image', image: 'relative/image.png' },
        { type: 'image', image: '/9j/AAAA' },
        { type: 'image', image: 'aW1hZ2U=', filename: 'name-only.png' },
      ),
      tool('1', { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }),
      {
        role: 'assistant',
        content: [{ type: 'file', data: 'aW1hZ2U=', mediaType: 'image/png' }],
      },
    ] as ModelMessage[]);
    expect(replaceImagesForCompression(messages)).toEqual([
      user(
        omitted,
        text('[Image: /tmp/local.png]'),
        text('[Image: /tmp/Chinese image.png]'),
        text('[Image: https://example.com/image.png]'),
        text('[Image: C:\\images\\test.png]'),
        text('[Image: relative/image.png]'),
        omitted,
        omitted,
      ),
      tool('1', omitted),
      { role: 'assistant', content: [omitted] },
    ]);
  });

  it('converts content, JSON array and wrapped tool outputs without losing IDs', () => {
    const variants = [
      {
        type: 'content',
        value: [
          { type: 'image-data', data: 'aW1hZ2U=', mediaType: 'image/png' },
          { type: 'image-url', url: 'https://example.com/test.png' },
        ],
      },
      {
        type: 'json',
        value: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }],
      },
      {
        type: 'json',
        value: {
          toolCallId: 'inner',
          output: {
            content: [
              {
                type: 'file',
                data: { type: 'url', url: 'file:///tmp/test.png' },
                mediaType: 'image/png',
              },
            ],
          },
        },
      },
    ];
    const messages = deepFreeze(
      variants.map((output, i) => ({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: String(i),
            toolName: 'Read',
            output,
          },
        ],
      })),
    );
    const result = replaceImagesForCompression(messages);
    expect(result.map((m) => m.content[0])).toEqual([
      {
        ...messages[0].content[0],
        output: {
          type: 'content',
          value: [omitted, text('[Image: https://example.com/test.png]')],
        },
      },
      { ...messages[1].content[0], output: { type: 'json', value: [omitted] } },
      {
        ...messages[2].content[0],
        output: {
          type: 'json',
          value: {
            toolCallId: 'inner',
            output: { content: [text('[Image: /tmp/test.png]')] },
          },
        },
      },
    ]);
  });

  it('removes cached Mastra modelOutput without mutating provider metadata', () => {
    const messages = deepFreeze([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'Read',
            output: { type: 'json', value: { content: [image('data')] } },
            providerOptions: {
              mastra: {
                modelOutput: { content: [image('cached')] },
                other: true,
              },
              example: { key: 'value' },
            },
          },
        ],
      },
    ]);
    const result = replaceImagesForCompression(messages);
    expect(result[0].content[0].providerOptions).toEqual({
      mastra: { other: true },
      example: { key: 'value' },
    });
    expect(result[0].content[0].output).toEqual({
      type: 'json',
      value: { content: [omitted] },
    });
    expect(
      messages[0].content[0].providerOptions.mastra.modelOutput,
    ).toBeDefined();
  });
});
