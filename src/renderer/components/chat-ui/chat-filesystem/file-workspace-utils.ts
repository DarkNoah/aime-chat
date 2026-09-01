export type FilePreviewKind =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'text'
  | 'unsupported';

export function getFileExtension(filePath: string): string {
  const fileName = filePath.replaceAll('\\', '/').split('/').pop() || '';
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex > 0
    ? fileName.substring(extensionIndex + 1).toLowerCase()
    : '';
}

export function isMarkdownFile(filePath: string): boolean {
  return ['md', 'markdown'].includes(getFileExtension(filePath));
}

export function isHtmlFile(filePath: string): boolean {
  return ['html', 'htm', 'xhtml'].includes(getFileExtension(filePath));
}

export function getFilePreviewKind(
  mimeType: string,
  isBinary: boolean,
): FilePreviewKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (!isBinary) return 'text';
  return 'unsupported';
}

export function toFileUrl(filePath: string): string {
  const normalizedPath = filePath.replaceAll('\\', '/');
  if (normalizedPath.startsWith('//')) {
    return `file:${encodeURI(normalizedPath)}`
      .replaceAll('#', '%23')
      .replaceAll('?', '%3F');
  }
  const absolutePath = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;
  return `file://${encodeURI(absolutePath)}`
    .replaceAll('#', '%23')
    .replaceAll('?', '%3F');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
