import { ChatPreviewData, ChatPreviewType } from '@/types/chat';

export function getChatPreviewEventUpdate(
  event: { event?: string; data?: { url?: string; filePath?: string } },
  threadId: string,
): Partial<ChatPreviewData> | null {
  if (event.event === 'web_preview' && typeof event.data?.url === 'string') {
    return {
      previewPanel: ChatPreviewType.WEB_PREVIEW,
      webPreviewUrl: event.data.url,
      webPreviewRequest: { threadId, url: event.data.url },
    };
  }
  if (
    event.event === 'file_preview' &&
    typeof event.data?.filePath === 'string' &&
    event.data.filePath.trim()
  ) {
    return {
      previewPanel: ChatPreviewType.FILE_SYSTEM,
      // A fresh request also allows reopening a file after closing its preview.
      filePreviewRequest: { threadId, filePath: event.data.filePath },
    };
  }
  return null;
}
