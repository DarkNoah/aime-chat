import type { FileUIPart } from 'ai';

export type ParsedChatMessageAttachment = {
  id: string;
  name: string;
  path: string;
  size: string;
  mimeType?: string;
};

export type ChatMessageAttachmentPart = FileUIPart &
  ParsedChatMessageAttachment;

const ATTACHMENT_ATTRIBUTE_PATTERN = /(\w+)="([^"]*)"/g;

const toFileUrl = (path: string) => {
  if (/^(data|file|https?):/i.test(path)) {
    return path;
  }

  const normalizedPath = path.replace(/\\/g, '/');
  const prefixedPath = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;

  return `file://${encodeURI(prefixedPath)}`;
};

export const parseChatMessageAttachment = (
  text: string,
): ParsedChatMessageAttachment | null => {
  const trimmed = text.trim();

  if (!trimmed.startsWith('<attachment ') || !trimmed.endsWith('>')) {
    return null;
  }

  const attributes: Record<string, string> = {};
  for (const match of trimmed.matchAll(ATTACHMENT_ATTRIBUTE_PATTERN)) {
    const [, key, value] = match;
    attributes[key] = value;
  }

  const { id, name, path, size, mimeType } = attributes;

  if (!id || !name || !path || !size || !mimeType) {
    return null;
  }

  return { id, name, path, size, mimeType };
};

export const toChatMessageAttachmentPart = (
  attachment: ParsedChatMessageAttachment,
): ChatMessageAttachmentPart => ({
  ...attachment,
  type: 'file',
  url: toFileUrl(attachment.path),
  mediaType: attachment.mimeType || 'application/octet-stream',
  filename: attachment.name,
});
