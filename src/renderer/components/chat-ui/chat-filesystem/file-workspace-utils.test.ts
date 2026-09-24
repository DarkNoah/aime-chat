import {
  formatFileSize,
  getFileExtension,
  getFilePreviewKind,
  isHtmlFile,
  isMarkdownFile,
  toFileUrl,
} from './file-workspace-utils';

describe('file workspace utilities', () => {
  it('recognizes markdown files case-insensitively', () => {
    expect(isMarkdownFile('C:\\notes\\README.MD')).toBe(true);
    expect(isMarkdownFile('/notes/readme.markdown')).toBe(true);
    expect(isMarkdownFile('/notes/readme.mdx')).toBe(false);
    expect(getFileExtension('/notes/.env')).toBe('');
  });

  it('recognizes html files case-insensitively', () => {
    expect(isHtmlFile('C:\\site\\Index.HTML')).toBe(true);
    expect(isHtmlFile('/site/page.htm')).toBe(true);
    expect(isHtmlFile('/site/page.xhtml')).toBe(true);
    expect(isHtmlFile('/site/page.hbs')).toBe(false);
  });

  it('uses MIME types before the binary flag for previews', () => {
    expect(getFilePreviewKind('image/svg+xml', false)).toBe('image');
    expect(getFilePreviewKind('audio/mpeg', true)).toBe('audio');
    expect(getFilePreviewKind('video/mp4', true)).toBe('video');
    expect(getFilePreviewKind('application/pdf', true)).toBe('pdf');
    expect(getFilePreviewKind('application/json', false)).toBe('text');
    expect(getFilePreviewKind('application/octet-stream', true)).toBe(
      'unsupported',
    );
  });

  it.each([
    '/workspace/script.ts',
    '/workspace/types.d.ts',
    'C:\\workspace\\SCRIPT.TS',
  ])(
    'previews text TypeScript file %s as source despite its video MIME type',
    (filePath) => {
      expect(getFilePreviewKind('video/mp2t', false, filePath)).toBe('text');
    },
  );

  it('keeps binary TS transport streams as video and text SVGs as images', () => {
    expect(getFilePreviewKind('video/mp2t', true, '/media/clip.ts')).toBe(
      'video',
    );
    expect(getFilePreviewKind('image/svg+xml', false, '/images/icon.svg')).toBe(
      'image',
    );
  });

  it.each(['glb', 'gltf', 'fbx', 'obj', 'stl'])(
    'recognizes %s models even with generic MIME types or text contents',
    (ext) => {
      expect(
        getFilePreviewKind(
          'application/octet-stream',
          true,
          `/models/model.${ext}`,
        ),
      ).toBe('model');
      expect(
        getFilePreviewKind(
          'text/plain',
          false,
          `C:\\models\\MODEL.${ext.toUpperCase()}`,
        ),
      ).toBe('model');
    },
  );

  it('creates encoded file URLs for Windows and POSIX paths', () => {
    expect(toFileUrl('C:\\work\\hello world#1?.png')).toBe(
      'file:///C:/work/hello%20world%231%3F.png',
    );
    expect(toFileUrl('/tmp/hello world.md')).toBe(
      'file:///tmp/hello%20world.md',
    );
    expect(toFileUrl('\\\\server\\share\\hello world.png')).toBe(
      'file://server/share/hello%20world.png',
    );
  });

  it('formats file sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
