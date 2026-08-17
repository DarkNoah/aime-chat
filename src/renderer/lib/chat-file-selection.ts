export const MAX_CHAT_FILE_SELECTION_BYTES = 50 * 1024;

export type ChatFileSelectionReference = {
  serializedText: string;
  selectedText: string;
  sourcePath: string;
  startLine?: number;
  endLine?: number;
};

export type ChatFileSelectionInput = Omit<
  ChatFileSelectionReference,
  'serializedText'
>;

export type ChatFileSelectionSegment =
  | { type: 'text'; text: string }
  | { type: 'file-selection'; reference: ChatFileSelectionReference };

const XML_ENTITY_PATTERN = /[&<>"']/g;
const ENCODED_XML_ENTITY_PATTERN = /&(amp|lt|gt|quot|apos);/g;

const ENCODED_ATTRIBUTE_VALUE = '((?:&(?:amp|lt|gt|quot|apos);|[^&"\'<>])*)';
const ENCODED_ELEMENT_VALUE = '((?:&(?:amp|lt|gt|quot|apos);|[^&"\'<>])*)';
const FILE_SELECTION_PATTERN_SOURCE = `<file-selection path="${ENCODED_ATTRIBUTE_VALUE}"(?: lines="([1-9]\\d*:[1-9]\\d*)")?>${ENCODED_ELEMENT_VALUE}</file-selection>`;
const COMPLETE_FILE_SELECTION_PATTERN = new RegExp(
  `^${FILE_SELECTION_PATTERN_SOURCE}$`,
  'u',
);
const GLOBAL_FILE_SELECTION_PATTERN = new RegExp(
  FILE_SELECTION_PATTERN_SOURCE,
  'gu',
);
const FILE_SELECTION_TAG_START_PATTERN = /<(\/?file-selection)(?=[\s>])/gu;

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

const DECODED_XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const escapeXml = (value: string): string =>
  value.replace(XML_ENTITY_PATTERN, (character) => XML_ENTITIES[character]);

const decodeXml = (value: string): string =>
  value.replace(
    ENCODED_XML_ENTITY_PATTERN,
    (_entity, name: string) => DECODED_XML_ENTITIES[name],
  );

const getUtf8ByteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

const validateXmlText = (value: string, field: string) => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    const valid =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (!valid) {
      throw new TypeError(`${field} contains an invalid XML character`);
    }
  }
};

const validateLineRange = (startLine?: number, endLine?: number) => {
  if (startLine === undefined && endLine === undefined) {
    return;
  }
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    throw new RangeError('File selection lines must be a valid range');
  }
};

const validateInput = (
  input: ChatFileSelectionInput,
): ChatFileSelectionInput => {
  const { selectedText, sourcePath, startLine, endLine } = input;

  if (typeof selectedText !== 'string' || selectedText.trim().length === 0) {
    throw new TypeError('File selection text must not be empty');
  }
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    throw new TypeError('File selection path must not be empty');
  }

  validateXmlText(selectedText, 'File selection text');
  validateXmlText(sourcePath, 'File selection path');
  validateLineRange(startLine, endLine);

  if (getUtf8ByteLength(selectedText) > MAX_CHAT_FILE_SELECTION_BYTES) {
    throw new RangeError('File selection text exceeds the 50 KB limit');
  }

  return { selectedText, sourcePath, startLine, endLine };
};

const serializeValidatedInput = (input: ChatFileSelectionInput): string => {
  const lines =
    input.startLine === undefined
      ? ''
      : ` lines="${input.startLine}:${input.endLine}"`;
  return `<file-selection path="${escapeXml(input.sourcePath)}"${lines}>${escapeXml(input.selectedText)}</file-selection>`;
};

export const serializeChatFileSelection = (
  input: ChatFileSelectionInput,
): string => serializeValidatedInput(validateInput(input));

export const createChatFileSelectionReference = (
  input: ChatFileSelectionInput,
): ChatFileSelectionReference => {
  const validated = validateInput(input);
  return {
    ...validated,
    serializedText: serializeValidatedInput(validated),
  };
};

const referenceFromMatch = (
  match: RegExpMatchArray | RegExpExecArray,
): ChatFileSelectionReference | undefined => {
  const [, encodedPath, lineRange, encodedText] = match;
  const [startLine, endLine] = lineRange
    ? lineRange.split(':').map(Number)
    : [undefined, undefined];

  try {
    return createChatFileSelectionReference({
      selectedText: decodeXml(encodedText),
      sourcePath: decodeXml(encodedPath),
      startLine,
      endLine,
    });
  } catch {
    return undefined;
  }
};

export const parseChatFileSelection = (
  serializedText: string,
): ChatFileSelectionReference | undefined => {
  if (typeof serializedText !== 'string') return undefined;
  const match = serializedText.match(COMPLETE_FILE_SELECTION_PATTERN);
  return match ? referenceFromMatch(match) : undefined;
};

export const parseChatFileSelectionSegments = (
  input: string,
): ChatFileSelectionSegment[] => {
  if (!input) return [];

  const segments: ChatFileSelectionSegment[] = [];
  let textStart = 0;

  for (const match of input.matchAll(GLOBAL_FILE_SELECTION_PATTERN)) {
    const reference = referenceFromMatch(match);
    if (reference && match.index !== undefined) {
      if (match.index > textStart) {
        segments.push({
          type: 'text',
          text: input.slice(textStart, match.index),
        });
      }
      segments.push({ type: 'file-selection', reference });
      textStart = match.index + match[0].length;
    }
  }

  if (textStart < input.length) {
    segments.push({ type: 'text', text: input.slice(textStart) });
  }

  return segments;
};

/**
 * Keeps untrusted or malformed file-selection tags visible when their text is
 * passed through the chat Markdown renderer, which otherwise treats them as
 * raw HTML custom elements.
 */
export const escapeChatFileSelectionMarkup = (input: string): string =>
  input.replace(FILE_SELECTION_TAG_START_PATTERN, '&lt;$1');
