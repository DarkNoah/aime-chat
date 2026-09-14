import { fireEvent, render, screen } from '@testing-library/react';
import { MarkdownFileLink, MarkdownLink } from './link';
import { getMarkdownFilePath } from './local-file-link';

// The DOM tests exercise the link handlers, without loading the ESM AST walker.
jest.mock('unist-util-visit', () => ({ visit: jest.fn() }));

describe('Markdown file links', () => {
  const openPath = jest.fn();

  beforeEach(() => {
    openPath.mockClear();
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { app: { openPath } },
    });
  });

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
