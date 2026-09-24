import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { FileWorkspace } from './file-workspace';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../model-viewer', () => ({
  ModelViewer: ({ url, ext }: { url: string; ext: string }) => (
    <div data-testid="model-preview" data-url={url} data-extension={ext} />
  ),
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

jest.mock('./code-text-editor', () => ({
  CodeTextEditor: ({
    value,
    ariaLabel,
    onChange,
    onSelectionChange,
  }: {
    value: string;
    ariaLabel: string;
    onChange: (value: string) => void;
    onSelectionChange?: (selection: {
      text: string;
      startLine: number;
      endLine: number;
    }) => void;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onSelect={(event) => {
        const { selectionStart: from, selectionEnd: to } = event.currentTarget;
        if (from === to) return;
        onSelectionChange?.({
          text: value.slice(from, to),
          startLine: value.slice(0, from).split('\n').length,
          endLine: value.slice(0, Math.max(from, to - 1)).split('\n').length,
        });
      }}
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

  it.each([
    ['C:\\workspace\\模型 #1.GLB', 'application/octet-stream', true, 'glb'],
    ['/workspace/model.gltf', 'application/json', false, 'gltf'],
    ['/workspace/model.obj', 'text/plain', false, 'obj'],
  ])(
    'previews model %s from disk without treating it as editable text',
    async (filePath, mimeType, isBinary, ext) => {
      readFileContent.mockResolvedValue({
        content: 'partial model data',
        truncated: true,
        size: 3 * 1024 * 1024,
        mimeType,
        isBinary,
      });
      render(
        <FileWorkspace
          filePath={filePath}
          workspace="/workspace"
          onClose={jest.fn()}
          onDirtyChange={jest.fn()}
        />,
      );
      const preview = await screen.findByTestId('model-preview');
      expect(preview).toHaveAttribute('data-extension', ext);
      expect(preview).toHaveAttribute(
        'data-url',
        ext === 'glb'
          ? 'file:///C:/workspace/%E6%A8%A1%E5%9E%8B%20%231.GLB'
          : `file://${filePath}`,
      );
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(
        screen.queryByText('chat.file_preview_unsupported'),
      ).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      expect(writeFileContent).not.toHaveBeenCalled();
    },
  );

  it('opens TypeScript source with a video MIME type in the editor and saves it', async () => {
    const content = 'export const answer: number = 42;';
    readFileContent.mockResolvedValue({
      content,
      truncated: false,
      size: content.length,
      mimeType: 'video/mp2t',
      isBinary: false,
    });
    const { container } = render(
      <FileWorkspace
        filePath="/workspace/script.ts"
        workspace="/workspace"
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );
    const editor = await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    });
    expect(editor).toHaveValue(content);
    expect(container.querySelector('video')).toBeNull();
    const updated = 'export const answer: number = 43;';
    fireEvent.change(editor, { target: { value: updated } });
    fireEvent.click(screen.getByTitle('common.save (Ctrl+S)'));
    await waitFor(() => {
      expect(writeFileContent).toHaveBeenCalledWith(
        '/workspace/script.ts',
        updated,
        '/workspace',
      );
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

  it('adds a source selection to chat with its exact line range', async () => {
    readFileContent.mockResolvedValue({
      content: 'one\ntwo\nthree\nfour',
      truncated: false,
      size: 18,
      mimeType: 'text/plain',
      isBinary: false,
    });
    const onAddToChat = jest.fn();
    render(
      <FileWorkspace
        filePath={'C:\\workspace\\notes.txt'}
        workspace={'C:\\workspace'}
        onAddToChat={onAddToChat}
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    const editor = (await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    })) as HTMLTextAreaElement;
    editor.setSelectionRange(4, 13);
    fireEvent.select(editor);
    fireEvent.contextMenu(editor);
    fireEvent.click(await screen.findByText('chat.add_to_chat'));

    expect(onAddToChat).toHaveBeenCalledWith({
      selectedText: 'two\nthree',
      sourcePath: 'C:\\workspace\\notes.txt',
      startLine: 2,
      endLine: 3,
      serializedText:
        '<file-selection path="C:\\workspace\\notes.txt" lines="2:3">two\nthree</file-selection>',
    });
  });

  it('renders html files in a preview frame and can switch to source', async () => {
    readFileContent.mockResolvedValue({
      content: '<h1>hello</h1>',
      truncated: false,
      size: 14,
      mimeType: 'text/html',
      isBinary: false,
    });
    render(
      <FileWorkspace
        filePath="/workspace/index.html"
        workspace="/workspace"
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    const frame = await screen.findByTitle('index.html');
    expect(frame).toHaveAttribute('src', 'file:///workspace/index.html');

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.file_source_editor' }),
    );
    expect(
      await screen.findByRole('textbox', { name: 'chat.file_source_editor' }),
    ).toHaveValue('<h1>hello</h1>');
  });

  it('still renders the preview frame for truncated html files', async () => {
    readFileContent.mockResolvedValue({
      content: '<h1>huge</h1>',
      truncated: true,
      size: 8 * 1024 * 1024,
      mimeType: 'text/html',
      isBinary: false,
    });
    render(
      <FileWorkspace
        filePath="/workspace/report.html"
        workspace="/workspace"
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    expect(await screen.findByTitle('report.html')).toHaveAttribute(
      'src',
      'file:///workspace/report.html',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.file_source_editor' }),
    );
    expect(
      await screen.findByText('chat.file_too_large_readonly'),
    ).toBeInTheDocument();
  });

  it('keeps line metadata when Markdown is edited in source mode', async () => {
    readFileContent.mockResolvedValue({
      content: '# Heading\nfirst paragraph\nsecond paragraph',
      truncated: false,
      size: 42,
      mimeType: 'text/markdown',
      isBinary: false,
    });
    const onAddToChat = jest.fn();
    render(
      <FileWorkspace
        filePath={'C:\\workspace\\README.md'}
        workspace={'C:\\workspace'}
        onAddToChat={onAddToChat}
        onClose={jest.fn()}
        onDirtyChange={jest.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'chat.file_source_editor',
      }),
    );
    const editor = (await screen.findByRole('textbox', {
      name: 'chat.file_source_editor',
    })) as HTMLTextAreaElement;
    editor.setSelectionRange(10, 42);
    fireEvent.select(editor);
    fireEvent.contextMenu(editor);
    fireEvent.click(await screen.findByText('chat.add_to_chat'));

    expect(onAddToChat).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: 'first paragraph\nsecond paragraph',
        sourcePath: 'C:\\workspace\\README.md',
        startLine: 2,
        endLine: 3,
        serializedText: expect.stringContaining(' lines="2:3"'),
      }),
    );
  });
});
