import { fireEvent, render, screen } from '@testing-library/react';
import { MarkdownFileLink, MarkdownLink, MarkdownLinkContext } from './link';
import { getMarkdownFilePath } from './local-file-link';
import { eventBus } from '@/renderer/lib/event-bus';

// The DOM tests exercise the link handlers, without loading the ESM AST walker.
jest.mock('unist-util-visit', () => ({ visit: jest.fn() }));

describe('Markdown file links', () => {
  const openPath = jest.fn();

  beforeEach(() => {
    openPath.mockClear();
    eventBus.all.clear();
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { app: { openPath } },
    });
  });

  it.each([
    ['stt-diarized.json', '/tmp/chat', '/tmp/chat/stt-diarized.json'],
    ['./stt-diarized.json', '/tmp/chat/', '/tmp/chat/stt-diarized.json'],
    ['outputs/../stt.json', '/tmp/chat', '/tmp/chat/stt.json'],
    ['../stt.json', '/tmp/chat', '/tmp/stt.json'],
    [
      '%E7%BB%93%E6%9E%9C%20file.json',
      '/tmp/100% chat',
      '/tmp/100% chat/结果 file.json',
    ],
    ['stt%2520.json', '/tmp/chat', '/tmp/chat/stt%20.json'],
    ['stt.json', 'C:\\Users\\Noah\\chat', 'C:/Users/Noah/chat/stt.json'],
    ['../stt.json', '\\\\server\\share\\chat', '//server/share/stt.json'],
  ])('resolves %s against the chat workspace', (href, workspace, expected) => {
    render(
      <MarkdownLinkContext.Provider value={{ workspace, threadId: 'chat-1' }}>
        <MarkdownFileLink href={href}>结构化 JSON</MarkdownFileLink>
      </MarkdownLinkContext.Provider>,
    );
    expect(fireEvent.click(screen.getByRole('link'))).toBe(false);
    expect(openPath).toHaveBeenCalledWith(expected);
  });

  it('updates relative links when the workspace arrives or changes', () => {
    const content = (
      <MarkdownFileLink href="stt-diarized.json">JSON</MarkdownFileLink>
    );
    const { rerender } = render(content);
    expect(screen.queryByRole('link')).toBeNull();
    for (const workspace of ['/tmp/chat-1', '/tmp/chat-2']) {
      rerender(
        <MarkdownLinkContext.Provider value={{ workspace }}>
          {content}
        </MarkdownLinkContext.Provider>,
      );
      fireEvent.click(screen.getByRole('link'));
      expect(openPath).toHaveBeenLastCalledWith(
        `${workspace}/stt-diarized.json`,
      );
    }
  });

  it.each([
    'https://example.com/file.json',
    'javascript%3Aalert(1)',
    'data%3Atext/html,test',
    '//example.com/file.json',
    '%2F%2Fexample.com/file.json',
    '#section',
    '?query=1',
    'bad%00.json',
    'bad%ZZ.json',
    'sandbox:./file.json',
  ])('rejects non-file destinations even with a workspace: %s', (href) => {
    expect(getMarkdownFilePath(href, '/tmp/chat')).toBeUndefined();
  });

  it.each(['https://example.com/report', 'http://localhost:3000'])(
    'opens %s through the built-in browser preview',
    (href) => {
      const preview = jest.fn();
      eventBus.on('chat:onEvent:chat-1', preview);
      render(
        <MarkdownLinkContext.Provider value={{ threadId: 'chat-1' }}>
          <MarkdownLink href={href}>网页</MarkdownLink>
        </MarkdownLinkContext.Provider>,
      );
      expect(fireEvent.click(screen.getByRole('link'))).toBe(false);
      expect(preview).toHaveBeenCalledWith({
        event: 'web_preview',
        data: { url: href },
      });
      expect(openPath).not.toHaveBeenCalled();
      preview.mockClear();
      expect(
        fireEvent(
          screen.getByRole('link'),
          new MouseEvent('auxclick', {
            button: 1,
            bubbles: true,
            cancelable: true,
          }),
        ),
      ).toBe(false);
      expect(preview).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      '/tmp/香港身份与跨境资产合规_公众号文章.html',
      '/tmp/香港身份与跨境资产合规_公众号文章.html',
    ],
    [
      '/tmp/Project%20Notes/%E9%A6%99%E6%B8%AF.html',
      '/tmp/Project Notes/香港.html',
    ],
    [
      'file:///tmp/Project%20Notes/%E9%A6%99%E6%B8%AF.html',
      '/tmp/Project Notes/香港.html',
    ],
    [
      'file:///C:/Users/Noah/Project%20Notes/report.html',
      'C:/Users/Noah/Project Notes/report.html',
    ],
    ['C:\\Users\\Noah\\report.html', 'C:\\Users\\Noah\\report.html'],
    [
      'sandbox:/Users/noah/Library/Application%20Support/aime-chat/threads/pteU985CJ2h3kr25/reference-frame-variation.mp4',
      '/Users/noah/Library/Application Support/aime-chat/threads/pteU985CJ2h3kr25/reference-frame-variation.mp4',
    ],
    [
      'sandbox:/tmp/%E9%A6%99%E6%B8%AF%20report%2520.html',
      '/tmp/香港 report%20.html',
    ],
  ])('opens a local artifact through Electron: %s', (href, filePath) => {
    render(<MarkdownFileLink href={href}>下载文章</MarkdownFileLink>);
    expect(openPath).not.toHaveBeenCalled();
    const link = screen.getByRole('link', { name: '下载文章' });
    expect(fireEvent.click(link)).toBe(false);
    expect(openPath).toHaveBeenCalledWith(filePath);
    expect(openPath).toHaveBeenCalledTimes(1);
  });

  it.each([
    'https://example.com/report.html',
    '//example.com/report.html',
    './report.html',
    // eslint-disable-next-line no-script-url -- Verify rejection of script URLs.
    'javascript:alert(1)',
    'data:text/html,test',
    '/tmp/invalid%00.html',
    'file:///tmp/invalid%00.html',
    'file:///tmp/invalid%ZZ.html',
    'sandbox:./report.html',
    'sandbox:https://example.com/report.html',
    'sandbox:javascript:alert(1)',
    'sandbox:/tmp/invalid%00.html',
    'sandbox:/tmp/invalid%ZZ.html',
  ])(
    'does not treat an invalid or non-file URL as a local artifact: %s',
    (href) => {
      expect(getMarkdownFilePath(href)).toBeUndefined();
      render(<MarkdownFileLink href={href}>文档</MarkdownFileLink>);
      expect(screen.queryByRole('link')).toBeNull();
      fireEvent.click(screen.getByText('文档'));
      expect(openPath).not.toHaveBeenCalled();
    },
  );

  it('keeps incomplete links inert and enables the completed URL', () => {
    const { rerender } = render(
      <MarkdownLink href="streamdown:incomplete-link">文档</MarkdownLink>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('文档').getAttribute('data-incomplete')).toBe(
      'true',
    );

    rerender(<MarkdownLink href="https://example.com/doc">文档</MarkdownLink>);
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      'https://example.com/doc',
    );
    expect(openPath).not.toHaveBeenCalled();
  });
});
