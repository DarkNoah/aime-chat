type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getMediaType(part: UnknownRecord) {
  if (typeof part.mediaType === 'string' && part.mediaType) {
    return part.mediaType;
  }
  if (typeof part.mimeType === 'string' && part.mimeType) {
    return part.mimeType;
  }
  return undefined;
}

function getInlineMediaSource(part: UnknownRecord) {
  const mediaType = getMediaType(part);
  if (
    (part.type === 'media' ||
      part.type === 'image' ||
      part.type === 'image-data' ||
      part.type === 'video' ||
      part.type === 'video-data' ||
      part.type === 'file-data') &&
    typeof part.data === 'string'
  ) {
    return {
      data: part.data,
      mediaType,
      isUrl: part.data.startsWith('data:') || /^https?:\/\//.test(part.data),
    };
  }

  if (part.type === 'image-url' && typeof part.url === 'string') {
    return {
      data: part.url,
      mediaType: mediaType || 'image/jpeg',
      isUrl: true,
    };
  }

  if (part.type !== 'file' || !isRecord(part.data)) {
    return null;
  }

  if (part.data.type === 'data' && typeof part.data.data === 'string') {
    return {
      data: part.data.data,
      mediaType,
      isUrl: part.data.data.startsWith('data:'),
    };
  }

  if (part.data.type === 'url' && typeof part.data.url === 'string') {
    return {
      data: part.data.url,
      mediaType,
      isUrl: true,
    };
  }

  return null;
}

function getMediaKind(part: UnknownRecord) {
  const mediaType = getMediaType(part);
  if (mediaType === 'image' || mediaType?.startsWith('image/')) return 'image';
  if (mediaType === 'video' || mediaType?.startsWith('video/')) return 'video';

  if (
    part.type === 'image' ||
    part.type === 'image-data' ||
    part.type === 'image-url'
  ) {
    return 'image';
  }
  if (part.type === 'video' || part.type === 'video-data') {
    return 'video';
  }
  return null;
}

function toDataUrl(
  source: NonNullable<ReturnType<typeof getInlineMediaSource>>,
  fallbackMediaType: string,
) {
  let mediaType = source.mediaType || fallbackMediaType;
  if (source.mediaType === 'image') {
    mediaType = 'image/jpeg';
  } else if (source.mediaType === 'video') {
    mediaType = 'video/mp4';
  }
  return source.isUrl ? source.data : `data:${mediaType};base64,${source.data}`;
}

function getToolContentParts(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (Array.isArray(value.result)) {
    return value.result;
  }
  if (Array.isArray(value.content)) {
    return value.content;
  }
  if (value.type === 'content' && Array.isArray(value.value)) {
    return value.value;
  }
  if (isRecord(value.result)) {
    return getToolContentParts(value.result);
  }
  return null;
}

function parseToolContent(value: unknown): unknown[] | null {
  if (typeof value !== 'string') {
    return getToolContentParts(value);
  }

  const trimmed = value.trim();
  if (
    (!trimmed.startsWith('[') || !trimmed.endsWith(']')) &&
    (!trimmed.startsWith('{') || !trimmed.endsWith('}'))
  ) {
    return null;
  }

  try {
    return getToolContentParts(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function remapOpenAICompatibleParts(parts: unknown[]) {
  let modified = false;
  const content = parts.map((part) => {
    if (!isRecord(part)) {
      return part;
    }

    const source = getInlineMediaSource(part);
    const kind = getMediaKind(part);
    if (!source || !kind) {
      return part;
    }

    modified = true;
    if (kind === 'image') {
      return {
        type: 'image_url',
        image_url: {
          url: toDataUrl(source, 'image/jpeg'),
        },
      };
    }

    return {
      type: 'video_url',
      video_url: {
        url: toDataUrl(source, 'video/mp4'),
      },
    };
  });

  return modified ? content : null;
}

function remapOpenAICompatibleMessages(body: UnknownRecord) {
  if (!Array.isArray(body.messages)) {
    return false;
  }

  let modified = false;
  body.messages = body.messages.map((message) => {
    if (
      !isRecord(message) ||
      message.role !== 'tool' ||
      typeof message.content !== 'string'
    ) {
      return message;
    }

    const parts = parseToolContent(message.content);
    if (!parts) {
      return message;
    }

    const content = remapOpenAICompatibleParts(parts);
    if (!content) {
      return message;
    }

    modified = true;
    return {
      ...message,
      content,
    };
  });

  return modified;
}

function toResponsesContentPart(part: unknown) {
  if (!isRecord(part)) {
    return {
      type: 'input_text',
      text: typeof part === 'string' ? part : JSON.stringify(part),
    };
  }

  if (
    part.type === 'input_text' ||
    part.type === 'input_image' ||
    part.type === 'input_file'
  ) {
    return part;
  }

  const source = getInlineMediaSource(part);
  if (source && getMediaKind(part) === 'image') {
    return {
      type: 'input_image',
      image_url: toDataUrl(source, 'image/jpeg'),
    };
  }

  if (part.type === 'text' && typeof part.text === 'string') {
    return {
      type: 'input_text',
      text: part.text,
    };
  }

  return {
    type: 'input_text',
    text: JSON.stringify(part),
  };
}

function remapResponsesOutput(output: unknown) {
  const parts = parseToolContent(output);
  if (!parts) {
    return null;
  }

  const hasLegacyImage = parts.some(
    (part) =>
      isRecord(part) &&
      Boolean(getInlineMediaSource(part)) &&
      getMediaKind(part) === 'image',
  );
  if (!hasLegacyImage) {
    return null;
  }

  return parts.map(toResponsesContentPart);
}

function remapResponsesInput(body: UnknownRecord) {
  if (!Array.isArray(body.input)) {
    return false;
  }

  let modified = false;
  body.input = body.input.map((item) => {
    if (!isRecord(item) || item.type !== 'function_call_output') {
      return item;
    }

    const output = remapResponsesOutput(item.output);
    if (!output) {
      return item;
    }

    modified = true;
    return {
      ...item,
      output,
    };
  });

  return modified;
}

/**
 * Rewrites multimodal tool results at the final HTTP request boundary.
 *
 * OpenAI-compatible chat endpoints use `messages[].content` with `image_url`,
 * while the native Responses API uses `input[].function_call_output.output`
 * with `input_image`. Only recognized tool-result payloads are changed, so
 * request bodies for unrelated providers and message shapes pass through.
 */
export function hookModelRequestBody(content: string) {
  try {
    const body: unknown = JSON.parse(content);
    if (!isRecord(body)) {
      return content;
    }

    const messagesModified = remapOpenAICompatibleMessages(body);
    const inputModified = remapResponsesInput(body);
    return messagesModified || inputModified ? JSON.stringify(body) : content;
  } catch {
    return content;
  }
}
