export { getFilePathsFromUriList } from '@/utils/clipboard-file-paths';

export const CHAT_FILE_REFERENCE_MIME_TYPE =
  'application/x-aime-chat-file-reference';

export type ChatFileReference = {
  serializedPath: string;
  sourcePath: string;
  name: string;
  kind: 'file' | 'directory';
};

export const getFileReferenceName = (path: string) => {
  const normalizedPath = path.replace(/[\\/]+$/, '');
  return normalizedPath.split(/[\\/]/).pop() || path;
};

const isChatFileReference = (value: unknown): value is ChatFileReference => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const reference = value as Partial<ChatFileReference>;
  return (
    typeof reference.serializedPath === 'string' &&
    typeof reference.sourcePath === 'string' &&
    typeof reference.name === 'string' &&
    (reference.kind === 'file' || reference.kind === 'directory')
  );
};

export const setChatFileReferenceDragData = (
  dataTransfer: DataTransfer,
  reference: ChatFileReference,
) => {
  dataTransfer.setData('text/plain', reference.serializedPath);
  dataTransfer.setData('application/x-file-path', reference.serializedPath);
  dataTransfer.setData(
    CHAT_FILE_REFERENCE_MIME_TYPE,
    JSON.stringify(reference),
  );
  dataTransfer.effectAllowed = 'copy';
};

export const getChatFileReferenceDragData = (
  dataTransfer: DataTransfer,
): ChatFileReference | undefined => {
  const serialized = dataTransfer.getData(CHAT_FILE_REFERENCE_MIME_TYPE);
  if (!serialized) {
    return undefined;
  }

  try {
    const reference: unknown = JSON.parse(serialized);
    return isChatFileReference(reference) ? reference : undefined;
  } catch {
    return undefined;
  }
};

export const getPlainTextPathCandidate = (
  value: string,
): { serializedPath: string; sourcePath: string } | undefined => {
  const serializedPath = value.trim();
  if (!serializedPath || /[\r\n]/.test(serializedPath)) {
    return undefined;
  }

  const hasMatchingQuotes =
    (serializedPath.startsWith("'") && serializedPath.endsWith("'")) ||
    (serializedPath.startsWith('"') && serializedPath.endsWith('"'));
  const sourcePath = hasMatchingQuotes
    ? serializedPath.slice(1, -1)
    : serializedPath;
  const isAbsolutePath =
    sourcePath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(sourcePath) ||
    /^\\\\[^\\]+\\[^\\]+/.test(sourcePath);

  return isAbsolutePath ? { serializedPath, sourcePath } : undefined;
};
