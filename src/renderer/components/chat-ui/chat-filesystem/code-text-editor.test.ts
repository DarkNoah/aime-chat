import { EditorState } from '@uiw/react-codemirror';
import {
  getCodeEditorSelection,
  getLanguageExtension,
} from './code-text-editor';

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

describe('getCodeEditorSelection', () => {
  it('returns exact inclusive line numbers for a source selection', () => {
    const state = EditorState.create({ doc: 'one\ntwo\nthree\nfour' });
    const selected = state.update({
      selection: { anchor: 4, head: 13 },
    }).state;

    expect(getCodeEditorSelection(selected)).toEqual({
      text: 'two\nthree',
      startLine: 2,
      endLine: 3,
    });
  });

  it('does not count the next line when the range ends at its start', () => {
    const state = EditorState.create({ doc: 'one\ntwo\nthree' });
    const selected = state.update({
      selection: { anchor: 0, head: 8 },
    }).state;

    expect(getCodeEditorSelection(selected)).toEqual({
      text: 'one\ntwo\n',
      startLine: 1,
      endLine: 2,
    });
  });

  it('ignores empty and whitespace-only selections', () => {
    const state = EditorState.create({ doc: '   text' });

    expect(getCodeEditorSelection(state)).toBeNull();
    expect(
      getCodeEditorSelection(
        state.update({ selection: { anchor: 0, head: 3 } }).state,
      ),
    ).toBeNull();
  });
});
