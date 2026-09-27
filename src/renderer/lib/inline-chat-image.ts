/** In-memory PNG attachment. Deliberately has no local filesystem path. */
export type InlineChatImage = {
  type: 'file';
  mediaType: 'image/png';
  filename: string;
  url: string;
};

export const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export function createInlineChatImage(
  url: string,
  filename: string,
): InlineChatImage {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) {
    throw new Error('Invalid PNG image');
  }
  if (url.length > Math.ceil(INLINE_IMAGE_MAX_BYTES / 3) * 4 + 22) {
    throw new Error('Image exceeds 10 MB');
  }
  return { type: 'file', mediaType: 'image/png', filename, url };
}
