import {
  createInlineChatImage,
  INLINE_IMAGE_MAX_BYTES,
} from './inline-chat-image';

it('creates a base64 message part without any filesystem metadata', () => {
  expect(
    createInlineChatImage('data:image/png;base64,YQ==', 'selection.png'),
  ).toEqual({
    type: 'file',
    mediaType: 'image/png',
    filename: 'selection.png',
    url: 'data:image/png;base64,YQ==',
  });
});

it.each([
  'file:///tmp/a.png',
  'blob:preview',
  'https://example.com/a.png',
  'data:text/html;base64,YQ==',
  'data:image/png;base64,',
])('rejects non-embedded images: %s', (url) => {
  expect(() => createInlineChatImage(url, 'selection.png')).toThrow();
});

it('rejects oversized images', () => {
  expect(() =>
    createInlineChatImage(
      `data:image/png;base64,${'A'.repeat(Math.ceil(INLINE_IMAGE_MAX_BYTES / 3) * 4 + 4)}`,
      'selection.png',
    ),
  ).toThrow('10 MB');
});
