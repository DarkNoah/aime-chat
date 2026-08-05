import { EditorState } from '@uiw/react-codemirror';
import { getLanguageExtension } from './code-text-editor';

describe('getLanguageExtension', () => {
  it.each(['component.tsx', 'settings.json', 'README.md', 'script.py'])(
    'returns an extension compatible with the editor state for %s',
    (fileName) => {
      const extension = getLanguageExtension(fileName);

      expect(extension).not.toBeNull();
      expect(() =>
        EditorState.create({ extensions: extension ? [extension] : [] }),
      ).not.toThrow();
    },
  );

  it('keeps unknown text formats in plain-text mode', () => {
    expect(getLanguageExtension('notes.txt')).toBeNull();
  });
});
