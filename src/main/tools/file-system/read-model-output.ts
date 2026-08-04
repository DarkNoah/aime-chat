type UnknownRecord = Record<string, unknown>;

type ReadModelContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image-data';
      data: string;
      mediaType: string;
    }
  | {
      type: 'image-url';
      url: string;
      mediaType?: string;
    }
  | {
      type: 'file-data';
      data: string;
      mediaType: string;
      filename?: string;
    }
  | {
      type: 'file-url';
      url: string;
      mediaType: string;
      filename?: string;
    };

export type ReadModelOutput =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'json';
      value: unknown;
    }
  | {
      type: 'content';
      value: ReadModelContentPart[];
    };

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringifyForText(value: unknown) {
  return JSON.stringify(value) ?? String(value);
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

function getFilename(part: UnknownRecord) {
  return typeof part.filename === 'string' && part.filename
    ? part.filename
    : undefined;
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
  if (!match) {
    return null;
  }
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function getTaggedFileData(part: UnknownRecord) {
  if (part.type !== 'file' || !isRecord(part.data)) {
    return null;
  }
  if (part.data.type === 'data' && typeof part.data.data === 'string') {
    return {
      kind: 'data' as const,
      value: part.data.data,
    };
  }
  if (part.data.type === 'url' && typeof part.data.url === 'string') {
    return {
      kind: 'url' as const,
      value: part.data.url,
    };
  }
  return null;
}

function toImageModelPart(
  data: string,
  mediaType: string,
): ReadModelContentPart {
  const dataUrl = parseDataUrl(data);
  if (dataUrl) {
    return {
      type: 'image-data',
      data: dataUrl.data,
      mediaType: dataUrl.mediaType,
    };
  }
  if (/^https?:\/\//.test(data)) {
    return {
      type: 'image-url',
      url: data,
      mediaType,
    };
  }
  return {
    type: 'image-data',
    data,
    mediaType,
  };
}

function toFileModelPart(
  data: string,
  mediaType: string,
  filename?: string,
): ReadModelContentPart {
  const dataUrl = parseDataUrl(data);
  if (dataUrl) {
    return {
      type: 'file-data',
      data: dataUrl.data,
      mediaType: dataUrl.mediaType,
      ...(filename ? { filename } : {}),
    };
  }
  if (/^https?:\/\//.test(data)) {
    return {
      type: 'file-url',
      url: data,
      mediaType,
      ...(filename ? { filename } : {}),
    };
  }
  return {
    type: 'file-data',
    data,
    mediaType,
    ...(filename ? { filename } : {}),
  };
}

function toModelContentPart(part: unknown): ReadModelContentPart {
  if (!isRecord(part)) {
    return {
      type: 'text',
      text: typeof part === 'string' ? part : stringifyForText(part),
    };
  }

  if (part.type === 'text' && typeof part.text === 'string') {
    return {
      type: 'text',
      text: part.text,
    };
  }

  const mediaType = getMediaType(part);
  const taggedFile = getTaggedFileData(part);
  if (taggedFile && mediaType) {
    if (taggedFile.kind === 'url') {
      return mediaType.startsWith('image/')
        ? {
            type: 'image-url',
            url: taggedFile.value,
            mediaType,
          }
        : {
            type: 'file-url',
            url: taggedFile.value,
            mediaType,
            ...(getFilename(part) ? { filename: getFilename(part) } : {}),
          };
    }
    return mediaType.startsWith('image/')
      ? toImageModelPart(taggedFile.value, mediaType)
      : toFileModelPart(taggedFile.value, mediaType, getFilename(part));
  }

  if (
    typeof part.data === 'string' &&
    (part.type === 'image' ||
      part.type === 'image-data' ||
      (part.type === 'media' && mediaType?.startsWith('image/')))
  ) {
    return toImageModelPart(part.data, mediaType || 'image/jpeg');
  }

  if (
    typeof part.data === 'string' &&
    (part.type === 'video' ||
      part.type === 'video-data' ||
      part.type === 'file-data' ||
      part.type === 'media')
  ) {
    return toFileModelPart(
      part.data,
      mediaType || 'application/octet-stream',
      getFilename(part),
    );
  }

  if (part.type === 'image-url' && typeof part.url === 'string') {
    return {
      type: 'image-url',
      url: part.url,
      ...(mediaType ? { mediaType } : {}),
    };
  }

  if (part.type === 'file-url' && typeof part.url === 'string' && mediaType) {
    return {
      type: 'file-url',
      url: part.url,
      mediaType,
      ...(getFilename(part) ? { filename: getFilename(part) } : {}),
    };
  }

  return {
    type: 'text',
    text: stringifyForText(part),
  };
}

function getContentParts(output: unknown) {
  if (Array.isArray(output)) {
    return output;
  }
  if (isRecord(output) && Array.isArray(output.content)) {
    return output.content;
  }
  return null;
}

function unwrapToolOutput(output: unknown) {
  if (
    isRecord(output) &&
    typeof output.toolCallId === 'string' &&
    'output' in output
  ) {
    return output.output;
  }
  return output;
}

/**
 * Shapes Read's raw execution result for the next model turn without changing
 * the value returned to UI, manual tool calls, Extract, or knowledge-base code.
 */
export function toReadModelOutput(output: unknown): ReadModelOutput {
  const rawOutput = unwrapToolOutput(output);

  if (typeof rawOutput === 'string') {
    return {
      type: 'text',
      value: rawOutput,
    };
  }

  const content = getContentParts(rawOutput);
  if (content && content.length > 0) {
    return {
      type: 'content',
      value: content.map(toModelContentPart),
    };
  }

  if (rawOutput === undefined) {
    return {
      type: 'text',
      value: '',
    };
  }

  return {
    type: 'json',
    value: rawOutput,
  };
}
