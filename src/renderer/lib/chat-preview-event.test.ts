import { ChatPreviewType } from '@/types/chat';
import { getChatPreviewEventUpdate } from './chat-preview-event';

it('routes file requests to the filesystem and keeps repeat requests distinct', () => {
  const event = {
    event: 'file_preview',
    data: { filePath: '/tmp/report.pdf' },
  };
  const first = getChatPreviewEventUpdate(event, 'thread-1');
  expect(first).toEqual({
    previewPanel: ChatPreviewType.FILE_SYSTEM,
    filePreviewRequest: { threadId: 'thread-1', filePath: '/tmp/report.pdf' },
  });
  expect(
    getChatPreviewEventUpdate(event, 'thread-1').filePreviewRequest,
  ).not.toBe(first.filePreviewRequest);
});

it('preserves web previews and ignores unrelated or invalid events', () => {
  expect(
    getChatPreviewEventUpdate(
      { event: 'web_preview', data: { url: 'https://example.com' } },
      'thread-1',
    ),
  ).toEqual({
    previewPanel: ChatPreviewType.WEB_PREVIEW,
    webPreviewUrl: 'https://example.com',
  });
  expect(
    getChatPreviewEventUpdate({ event: 'files_preview' }, 'thread-1'),
  ).toBeNull();
  expect(
    getChatPreviewEventUpdate(
      { event: 'file_preview', data: { filePath: '' } },
      'thread-1',
    ),
  ).toBeNull();
});
