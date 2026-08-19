import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import {
  FileSelectionContextMenu,
  getDomEditorSelection,
  getPlainTextEditorSelection,
} from './file-selection-context-menu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

Object.defineProperty(window, 'DOMRect', {
  configurable: true,
  value: {
    fromRect: (rect: Partial<DOMRect> = {}) => ({
      bottom: rect.y ?? 0,
      height: rect.height ?? 0,
      left: rect.x ?? 0,
      right: rect.x ?? 0,
      top: rect.y ?? 0,
      width: rect.width ?? 0,
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      toJSON: () => ({}),
    }),
  },
});

describe('FileSelectionContextMenu', () => {
  it('only exposes add to chat for a non-empty editor selection', () => {
    const onAddToChat = jest.fn();
    const { rerender } = render(
      <FileSelectionContextMenu selection={null} onAddToChat={onAddToChat}>
        <div>Editor</div>
      </FileSelectionContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Editor'));
    expect(screen.queryByText('chat.add_to_chat')).not.toBeInTheDocument();

    const selection = { text: 'selected text', startLine: 8, endLine: 10 };
    rerender(
      <FileSelectionContextMenu selection={selection} onAddToChat={onAddToChat}>
        <div>Editor</div>
      </FileSelectionContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Editor'));
    fireEvent.click(screen.getByText('chat.add_to_chat'));

    expect(onAddToChat).toHaveBeenCalledWith(selection);
  });

  it('uses the selection snapshot captured when the menu opened', () => {
    const onAddToChat = jest.fn();
    const selection = { text: 'selected text', startLine: 8, endLine: 10 };
    const { rerender } = render(
      <FileSelectionContextMenu selection={selection} onAddToChat={onAddToChat}>
        <div>Editor</div>
      </FileSelectionContextMenu>,
    );

    fireEvent.contextMenu(screen.getByText('Editor'));
    rerender(
      <FileSelectionContextMenu selection={null} onAddToChat={onAddToChat}>
        <div>Editor</div>
      </FileSelectionContextMenu>,
    );
    fireEvent.click(screen.getByText('chat.add_to_chat'));

    expect(onAddToChat).toHaveBeenCalledWith(selection);
  });
});

describe('getDomEditorSelection', () => {
  it('captures visible text only when both endpoints belong to the editor', () => {
    const editor = document.createElement('div');
    editor.textContent = 'Milkdown selected text';
    document.body.append(editor);
    const range = document.createRange();
    range.setStart(editor.firstChild!, 9);
    range.setEnd(editor.firstChild!, 17);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(getDomEditorSelection(editor, selection)).toEqual({
      text: 'selected',
    });
    expect(
      getDomEditorSelection(document.createElement('div'), selection),
    ).toBeNull();

    selection.removeAllRanges();
    editor.remove();
  });
});

describe('getPlainTextEditorSelection', () => {
  it('returns inclusive line metadata for the lazy editor fallback', () => {
    expect(getPlainTextEditorSelection('one\ntwo\nthree', 4, 13)).toEqual({
      text: 'two\nthree',
      startLine: 2,
      endLine: 3,
    });
    expect(getPlainTextEditorSelection('one\r\ntwo\r\nthree', 0, 5)).toEqual({
      text: 'one\r\n',
      startLine: 1,
      endLine: 1,
    });
  });
});
