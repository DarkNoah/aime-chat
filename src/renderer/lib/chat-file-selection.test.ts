import {
  MAX_CHAT_FILE_SELECTION_BYTES,
  createChatFileSelectionReference,
  escapeChatFileSelectionMarkup,
  parseChatFileSelection,
  parseChatFileSelectionSegments,
  serializeChatFileSelection,
} from './chat-file-selection';

describe('chat file selection protocol', () => {
  it('round-trips a Windows path, line range, and XML entities', () => {
    const reference = createChatFileSelectionReference({
      sourcePath: 'C:\\Work\\R&D\\"notes".md',
      selectedText: '<h1 title="Tom & Jerry">Tom\'s notes</h1>',
      startLine: 8,
      endLine: 10,
    });

    expect(reference.serializedText).toBe(
      '<file-selection path="C:\\Work\\R&amp;D\\&quot;notes&quot;.md" lines="8:10">&lt;h1 title=&quot;Tom &amp; Jerry&quot;&gt;Tom&apos;s notes&lt;/h1&gt;</file-selection>',
    );
    expect(parseChatFileSelection(reference.serializedText)).toEqual(reference);
  });

  it('omits lines entirely for a Markdown selection without line metadata', () => {
    const input = {
      sourcePath: '/workspace/README.md',
      selectedText: '# Heading\n\n![Image](./image.png)',
    };
    const serialized = serializeChatFileSelection(input);

    expect(serialized).toBe(
      '<file-selection path="/workspace/README.md"># Heading\n\n![Image](./image.png)</file-selection>',
    );
    expect(serialized).not.toContain(' lines=');
    expect(parseChatFileSelection(serialized)).toEqual({
      ...input,
      startLine: undefined,
      endLine: undefined,
      serializedText: serialized,
    });
  });

  it('splits ordinary text and multiple file selections in source order', () => {
    const first = createChatFileSelectionReference({
      sourcePath: '/workspace/one.md',
      selectedText: 'first',
      startLine: 2,
      endLine: 2,
    });
    const second = createChatFileSelectionReference({
      sourcePath: '/workspace/two.md',
      selectedText: 'second',
      startLine: 5,
      endLine: 7,
    });
    const input = `Compare ${first.serializedText}\nwith ${second.serializedText}.`;

    expect(parseChatFileSelectionSegments(input)).toEqual([
      { type: 'text', text: 'Compare ' },
      { type: 'file-selection', reference: first },
      { type: 'text', text: '\nwith ' },
      { type: 'file-selection', reference: second },
      { type: 'text', text: '.' },
    ]);
  });

  it.each([
    '<file-selection path="/workspace/a.md">missing close',
    '<file-selection path="/workspace/a.md" lines="0:2">text</file-selection>',
    '<file-selection path="/workspace/a.md" lines="4:2">text</file-selection>',
    '<file-selection path="/workspace/a.md">   </file-selection>',
    '<file-selection path="/workspace/a.md">unknown &copy; entity</file-selection>',
    '<file-selection path="/workspace/a.md">raw \' quote</file-selection>',
    '<file-selection path="/workspace/a.md" extra="value">text</file-selection>',
  ])('treats malformed input as ordinary text: %s', (input) => {
    expect(parseChatFileSelection(input)).toBeUndefined();
    expect(parseChatFileSelectionSegments(input)).toEqual([
      { type: 'text', text: input },
    ]);
  });

  it('keeps an invalid tag as text while parsing a later valid tag', () => {
    const invalid =
      '<file-selection path="/workspace/a.md" lines="x:y">bad</file-selection>';
    const valid = createChatFileSelectionReference({
      sourcePath: '/workspace/b.md',
      selectedText: 'good',
    });

    expect(
      parseChatFileSelectionSegments(`${invalid}\n${valid.serializedText}`),
    ).toEqual([
      { type: 'text', text: `${invalid}\n` },
      { type: 'file-selection', reference: valid },
    ]);
  });

  it('escapes special tags before ordinary Markdown rendering', () => {
    expect(
      escapeChatFileSelectionMarkup(
        'Literal <file-selection path="/tmp/a.md">text</file-selection>',
      ),
    ).toBe(
      'Literal &lt;file-selection path="/tmp/a.md">text&lt;/file-selection>',
    );
  });

  it.each([
    {
      selectedText: '',
      sourcePath: '/workspace/a.md',
    },
    {
      selectedText: '\t\n ',
      sourcePath: '/workspace/a.md',
    },
    {
      selectedText: 'text\u0000',
      sourcePath: '/workspace/a.md',
    },
    {
      selectedText: 'text',
      sourcePath: '/workspace/a.md\u0000',
    },
    {
      selectedText: 'text',
      sourcePath: '/workspace/a.md',
      startLine: 1,
    },
    {
      selectedText: 'text',
      sourcePath: '/workspace/a.md',
      startLine: 3,
      endLine: 2,
    },
  ])('rejects invalid selection data', (input) => {
    expect(() => createChatFileSelectionReference(input)).toThrow();
  });

  it('allows exactly 50 KB and rejects selections above the limit', () => {
    const base = { sourcePath: '/workspace/large.md' };
    const atLimit = 'a'.repeat(MAX_CHAT_FILE_SELECTION_BYTES);

    expect(
      createChatFileSelectionReference({ ...base, selectedText: atLimit })
        .selectedText,
    ).toHaveLength(MAX_CHAT_FILE_SELECTION_BYTES);
    expect(() =>
      createChatFileSelectionReference({
        ...base,
        selectedText: `${atLimit}a`,
      }),
    ).toThrow('50 KB');
  });

  it('measures the 50 KB limit as UTF-8 bytes', () => {
    const selectedText = '你'.repeat(
      Math.floor(MAX_CHAT_FILE_SELECTION_BYTES / 3) + 1,
    );

    expect(() =>
      createChatFileSelectionReference({
        sourcePath: '/workspace/unicode.md',
        selectedText,
      }),
    ).toThrow('50 KB');
  });
});
