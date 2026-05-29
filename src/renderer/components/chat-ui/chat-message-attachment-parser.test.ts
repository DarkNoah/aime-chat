import {
  parseChatMessageAttachment,
  toChatMessageAttachmentPart,
} from './chat-message-attachment-parser';

describe('chat message attachment parser', () => {
  it('extracts id, name, path, and size from an attachment marker', () => {
    expect(
      parseChatMessageAttachment(
        '<attachment id="File #1" path="/Users/noah/My File.pdf" name="My File.pdf" size="42 KB">',
      ),
    ).toEqual({
      id: 'File #1',
      path: '/Users/noah/My File.pdf',
      name: 'My File.pdf',
      size: '42 KB',
    });
  });

  it('returns null for non-attachment text and closing tags', () => {
    expect(parseChatMessageAttachment('regular message')).toBeNull();
    expect(parseChatMessageAttachment('</attachment>')).toBeNull();
  });

  it('maps parsed attachment data to a file UI part', () => {
    expect(
      toChatMessageAttachmentPart({
        id: 'File #2',
        path: '/tmp/screenshot.png',
        name: 'screenshot.png',
        size: '15 KB',
      }),
    ).toMatchObject({
      id: 'File #2',
      type: 'file',
      url: 'file:///tmp/screenshot.png',
      mediaType: 'application/octet-stream',
      filename: 'screenshot.png',
      name: 'screenshot.png',
      path: '/tmp/screenshot.png',
      size: '15 KB',
    });
  });
});
