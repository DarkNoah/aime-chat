import { fileURLToPath } from 'url';

type RecordValue = Record<string, unknown>;
type Message = { role: string; content: unknown };

export const IMAGE_PLACEHOLDER = '[Image omitted]';
export const MAX_MESSAGE_IMAGES = 10;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof URL) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value),
  );
}

function isImagePart(part: RecordValue): boolean {
  const mediaType = part.mediaType ?? part.mimeType;
  return (
    ['image', 'image-data', 'image-url', 'image_url'].includes(
      part.type as string,
    ) ||
    (['file', 'file-data', 'file-url', 'media'].includes(part.type as string) &&
      typeof mediaType === 'string' &&
      mediaType.startsWith('image/'))
  );
}

function getImageSource(part: RecordValue): unknown {
  const source = part.image ?? part.data ?? part.url ?? part.image_url;
  // Tool output may use tagged file data or OpenAI's image_url wrapper.
  if (isRecord(source)) return source.data ?? source.url;
  return source;
}

function getReference(
  value: unknown,
  explicitPath = false,
): string | undefined {
  const source = value instanceof URL ? value.href : value;
  if (typeof source !== 'string' || !source || source.startsWith('data:')) {
    return undefined;
  }
  if (source.startsWith('file:')) {
    try {
      return fileURLToPath(source);
    } catch {
      return undefined;
    }
  }
  if (/^https?:\/\//i.test(source)) return source;
  // Bare base64 can start with '/', e.g. JPEG /9j/. Require a filename
  // extension for untagged paths so image bytes are never mistaken for a path.
  if (explicitPath || /^[^\r\n]+\.[a-z\d]{1,10}$/i.test(source)) {
    return source;
  }
  return undefined;
}

function imageToText(part: RecordValue) {
  const reference =
    getReference(part.path, true) ??
    getReference(part.filePath, true) ??
    getReference(getImageSource(part));
  return {
    type: 'text',
    text: reference ? `[Image: ${reference}]` : IMAGE_PLACEHOLDER,
  };
}

// Only descend through message content and tool outputs. Tool-call arguments,
// text, reasoning, and unrelated metadata must remain intact.
function mapContent(
  value: unknown,
  mapImage: (part: RecordValue) => unknown,
): unknown {
  if (Array.isArray(value)) {
    const result = [...value];
    for (let i = value.length - 1; i >= 0; i -= 1) {
      result[i] = mapContent(value[i], mapImage);
    }
    return result;
  }
  if (!isRecord(value)) return value;
  if (isImagePart(value)) return mapImage(value);
  if (['text', 'reasoning', 'tool-call'].includes(value.type as string)) {
    return value;
  }
  let result = value;
  for (const key of ['content', 'value', 'output']) {
    if (key in value) {
      result = { ...result, [key]: mapContent(value[key], mapImage) };
    }
  }
  // Mastra may cache another copy of the tool output in provider options.
  // Drop it so it cannot restore images or double-count their payloads.
  if (value.type === 'tool-result' && isRecord(value.providerOptions)) {
    const { mastra } = value.providerOptions;
    if (isRecord(mastra) && 'modelOutput' in mastra) {
      const { modelOutput, ...options } = mastra;
      result = {
        ...result,
        providerOptions: { ...value.providerOptions, mastra: options },
      };
    }
  }
  return result;
}

/** Keep inline images from the latest user and latest tool block, newest first. */
export function filterImagesBeforeSend<T extends Message>(messages: T[]): T[] {
  const result = [...messages];
  let foundUser = false;
  let toolBlock: 'unseen' | 'active' | 'closed' = 'unseen';
  const budget = { retained: 0 };

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const keepUserImages = message.role === 'user' && !foundUser;
    if (message.role === 'user') foundUser = true;
    if (message.role === 'tool' && toolBlock === 'unseen') toolBlock = 'active';
    if (
      (message.role === 'user' || message.role === 'assistant') &&
      toolBlock === 'active'
    ) {
      toolBlock = 'closed';
    }
    const keepImages =
      keepUserImages || (message.role === 'tool' && toolBlock === 'active');
    result[i] = {
      ...message,
      content: mapContent(message.content, (part) => {
        // URL/path references contain no inline image bytes and use no budget.
        if (getReference(getImageSource(part))) return part;
        if (keepImages && budget.retained < MAX_MESSAGE_IMAGES) {
          budget.retained += 1;
          return part;
        }
        return imageToText(part);
      }),
    };
  }
  return result;
}

/** Compression always receives text references, regardless of model vision. */
export function replaceImagesForCompression<T extends Message>(
  messages: T[],
): T[] {
  return messages.map((message) => ({
    ...message,
    content: mapContent(message.content, imageToText),
  }));
}
