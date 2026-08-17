import '@testing-library/jest-dom';
import {
  createLocalImageUrl,
  renderRawHtmlImages,
  resolveMarkdownImageUrl,
} from './milkdown-image-support';

describe('Milkdown image support', () => {
  it('resolves local Markdown images relative to the current document', () => {
    expect(
      resolveMarkdownImageUrl(
        '../images/图 1.png',
        '/workspace/docs/guide/readme.md',
      ),
    ).toBe('file:///workspace/docs/images/%E5%9B%BE%201.png');
    expect(
      resolveMarkdownImageUrl('assets/banner.png', 'C:\\workspace\\README.md'),
    ).toBe('file:///C:/workspace/assets/banner.png');
    expect(
      resolveMarkdownImageUrl(
        'images/already%20encoded.png',
        '/workspace/readme.md',
      ),
    ).toBe('file:///workspace/images/already%20encoded.png');
    expect(
      resolveMarkdownImageUrl(
        'C:\\workspace\\already%20encoded.png',
        '/workspace/readme.md',
      ),
    ).toBe('file:///C:/workspace/already%20encoded.png');
    expect(
      resolveMarkdownImageUrl(
        '\\\\server\\share\\already%20encoded.png',
        '/workspace/readme.md',
      ),
    ).toBe('file://server/share/already%20encoded.png');
  });

  it('preserves safe image URLs and rejects unsafe schemes', () => {
    const markdownFile = '/workspace/readme.md';
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const unsafeScriptUrl = ['java', 'script:alert(1)'].join('');

    expect(
      resolveMarkdownImageUrl('https://example.com/image.png', markdownFile),
    ).toBe('https://example.com/image.png');
    expect(
      resolveMarkdownImageUrl('//example.com/image.png', markdownFile),
    ).toBe('https://example.com/image.png');
    expect(resolveMarkdownImageUrl(dataUrl, markdownFile)).toBe(dataUrl);
    expect(resolveMarkdownImageUrl('file:///tmp/image.png', markdownFile)).toBe(
      'file:///tmp/image.png',
    );
    expect(resolveMarkdownImageUrl(unsafeScriptUrl, markdownFile)).toBe('');
    expect(resolveMarkdownImageUrl('data:text/html,unsafe', markdownFile)).toBe(
      '',
    );
  });

  it('creates a persistent local file URL without uploading over IPC', async () => {
    const file = new File(['image'], 'hello world.png', { type: 'image/png' });
    const getPathForFile = jest.fn(() => '/tmp/hello world.png');

    await expect(createLocalImageUrl(file, getPathForFile)).resolves.toBe(
      'file:///tmp/hello%20world.png',
    );
    expect(getPathForFile).toHaveBeenCalledWith(file);
  });

  it('renders only whitelisted attributes from raw HTML image blocks', () => {
    const container = document.createElement('span');
    const raw = `<div align="center">
      <img src="assets/banner.png" alt="Banner" title="Preview" width="100%" onerror="alert(1)" style="position: fixed" />
      <img src="https://example.com/too-tall.png" alt="Tall" height="999999" />
      <img src="javascript:alert(2)" alt="Unsafe" />
    </div>`;

    expect(
      renderRawHtmlImages(container, raw, (source) =>
        resolveMarkdownImageUrl(source, '/workspace/README.md'),
      ),
    ).toBe(true);

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute(
      'src',
      'file:///workspace/assets/banner.png',
    );
    expect(images[0]).toHaveAttribute('alt', 'Banner');
    expect(images[0]).toHaveAttribute('title', 'Preview');
    expect(images[0]).toHaveAttribute('width', '100%');
    expect(images[0]).not.toHaveAttribute('onerror');
    expect(images[0]).not.toHaveAttribute('style');
    expect(images[1]).not.toHaveAttribute('height');
    expect(container.dataset.value).toBe(raw);
  });

  it('keeps non-image raw HTML escaped as text', () => {
    const container = document.createElement('span');
    const raw = '<script>alert(1)</script><strong>safe text</strong>';

    expect(renderRawHtmlImages(container, raw, (source) => source)).toBe(false);
    expect(container).toHaveTextContent(raw);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('does not hide text mixed into a raw HTML image fragment', () => {
    const container = document.createElement('span');
    const raw = '<p><img src="image.png" />Important caption</p>';

    expect(renderRawHtmlImages(container, raw, (source) => source)).toBe(false);
    expect(container).toHaveTextContent(raw);
    expect(container.querySelector('img')).toBeNull();
  });
});
