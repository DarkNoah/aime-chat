import {
  CHAT_FILE_REFERENCE_MIME_TYPE,
  getChatFileReferenceDragData,
  getFilePathsFromUriList,
  getFileReferenceName,
  getPlainTextPathCandidate,
  setChatFileReferenceDragData,
  type ChatFileReference,
} from './chat-file-reference';
import { getFilePathsFromClipboardFormats } from '@/utils/clipboard-file-paths';

describe('chat file references', () => {
  it.each([
    ['/Volumes/Data/project/file.md', '/Volumes/Data/project/file.md'],
    ['"/Volumes/Data/project notes"', '/Volumes/Data/project notes'],
    ['C:\\Users\\Noah\\notes.txt', 'C:\\Users\\Noah\\notes.txt'],
    ['"C:\\Project Files\\notes.txt"', 'C:\\Project Files\\notes.txt'],
    ['\\\\server\\share\\notes.txt', '\\\\server\\share\\notes.txt'],
  ])('recognizes an absolute pasted path: %s', (value, sourcePath) => {
    expect(getPlainTextPathCandidate(value)).toEqual({
      serializedPath: value,
      sourcePath,
    });
  });

  it('ignores ordinary text and relative paths from the clipboard', () => {
    expect(getPlainTextPathCandidate('Review this file')).toBeUndefined();
    expect(getPlainTextPathCandidate('./notes.txt')).toBeUndefined();
  });

  it('reads Finder and Windows file URI clipboard payloads', () => {
    expect(
      getFilePathsFromUriList(
        '# copied files\nfile:///Users/noah/Project%20Notes/brief.md\nfile:///C:/Users/Noah/brief.docx',
      ),
    ).toEqual([
      '/Users/noah/Project Notes/brief.md',
      'C:/Users/Noah/brief.docx',
    ]);
  });

  it('reads native Finder, Explorer, and Linux clipboard file formats', () => {
    const clipboardValues = new Map([
      [
        'NSFilenamesPboardType',
        '<plist><array><string>/Users/noah/Project &amp; Notes/brief.md</string></array></plist>',
      ],
      ['public.file-url', 'file:///Users/noah/Project%20Notes/brief.md'],
      ['FileNameW', 'C:\\Users\\Noah\\Documents\\brief.docx\0'],
      [
        'x-special/gnome-copied-files',
        'copy\nfile:///home/noah/Project%20Notes/brief.txt',
      ],
    ]);

    expect(
      getFilePathsFromClipboardFormats(
        Array.from(clipboardValues.keys()),
        (format) => clipboardValues.get(format) || '',
      ),
    ).toEqual([
      '/Users/noah/Project & Notes/brief.md',
      '/Users/noah/Project Notes/brief.md',
      'C:\\Users\\Noah\\Documents\\brief.docx',
      '/home/noah/Project Notes/brief.txt',
    ]);
  });

  it('round-trips structured drag data and derives cross-platform names', () => {
    const reference: ChatFileReference = {
      serializedPath: '"./docs"',
      sourcePath: 'C:\\workspace\\docs',
      name: 'docs',
      kind: 'directory',
    };
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      getData: (type: string) => values.get(type) || '',
      setData: (type: string, value: string) => values.set(type, value),
    } as unknown as DataTransfer;

    setChatFileReferenceDragData(dataTransfer, reference);

    expect(values.get(CHAT_FILE_REFERENCE_MIME_TYPE)).toBe(
      JSON.stringify(reference),
    );
    expect(getChatFileReferenceDragData(dataTransfer)).toEqual(reference);
    expect(getFileReferenceName(reference.sourcePath)).toBe('docs');
  });
});
