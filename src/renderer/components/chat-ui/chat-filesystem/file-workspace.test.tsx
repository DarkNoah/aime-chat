import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { FileWorkspace } from './file-workspace';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('./code-text-editor', () => ({
  CodeTextEditor: ({
    value,
    ariaLabel,
    onChange,
  }: {
    value: string;
    ariaLabel: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const readFileContent = jest.fn();
const writeFileContent = jest.fn();
const toast = jest.fn();

describe('FileWorkspace', () => {
  beforeEach(() => {
    readFileContent.mockReset().mockResolvedValue({
      content: 'hello',
      truncated: false,
      size: 5,
      mimeType: 'text/plain',
      isBinary: false,
    });
    writeFileContent.mockReset().mockResolvedValue({
      size: 7,
      modifiedAt: 1,
    });
    toast.mockReset().mockResolvedValue(undefined);

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        app: {
          readFileContent,
          writeFileContent,
          toast,
          openPath: jest.fn(),
        },
      },
    });
  });

  it('edits and manually saves a text file', async () => {
    const onDirtyChange = jest.fn();
    render(
      <FileWorkspace
        filePath={'C:\\workspace\\notes.txt'}
        workspace={'C:\\workspace'}
        onClose={jest.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );

    const editor = await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    });
    fireEvent.change(editor, { target: { value: 'updated' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));

    fireEvent.click(screen.getByTitle('common.save (Ctrl+S)'));

    await waitFor(() => {
      expect(writeFileContent).toHaveBeenCalledWith(
        'C:\\workspace\\notes.txt',
        'updated',
        'C:\\workspace',
      );
    });
    expect(toast).toHaveBeenCalledWith('chat.file_saved', {
      type: 'success',
    });
  });

  it('saves the current text with Ctrl+S', async () => {
    render(
      <FileWorkspace
        filePath={'C:\\workspace\\notes.txt'}
        workspace={'C:\\workspace'}
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    const editor = await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    });
    fireEvent.change(editor, { target: { value: 'shortcut' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => {
      expect(writeFileContent).toHaveBeenCalledWith(
        'C:\\workspace\\notes.txt',
        'shortcut',
        'C:\\workspace',
      );
    });
  });

  it('does not capture Ctrl+S while the file panel is inactive', async () => {
    render(
      <FileWorkspace
        filePath={'C:\\workspace\\notes.txt'}
        workspace={'C:\\workspace'}
        active={false}
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    const editor = await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    });
    fireEvent.change(editor, { target: { value: 'hidden panel' } });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    expect(writeFileContent).not.toHaveBeenCalled();
  });
});
