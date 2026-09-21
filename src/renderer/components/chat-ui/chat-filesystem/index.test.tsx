import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import { ChatFilesystem } from '.';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => <div />,
}));

jest.mock('../../ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const getDirectoryTree = jest.fn();
const getDirectoryChildren = jest.fn();

jest.mock('./file-workspace', () => ({
  FileWorkspace: ({ filePath, onDirtyChange, onClose }: any) => (
    <div>
      <output data-testid="opened-file">{filePath}</output>
      <button type="button" onClick={() => onDirtyChange(true)}>
        Edit file
      </button>
      <button type="button" onClick={onClose}>
        Close file
      </button>
    </div>
  ),
}));

const request = (filePath: string) => ({ threadId: 'thread-1', filePath });

describe('ChatFilesystem', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    getDirectoryTree.mockReset().mockResolvedValue({
      name: 'workspace',
      path: '/workspace',
      isDirectory: true,
      children: [],
    });
    getDirectoryChildren.mockReset().mockResolvedValue([]);

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        app: {
          getDirectoryTree,
          getDirectoryChildren,
          openPath: jest.fn(),
        },
        projects: {
          openWith: jest.fn(),
        },
      },
    });
  });

  it('refreshes the directory whenever the hidden panel becomes visible', async () => {
    const { rerender } = render(
      <ChatFilesystem workspace="/workspace" active={false} />,
    );

    expect(getDirectoryTree).not.toHaveBeenCalled();

    rerender(<ChatFilesystem workspace="/workspace" active />);
    await waitFor(() => expect(getDirectoryTree).toHaveBeenCalledTimes(1));

    rerender(<ChatFilesystem workspace="/workspace" active={false} />);
    rerender(<ChatFilesystem workspace="/workspace" active />);
    await waitFor(() => expect(getDirectoryTree).toHaveBeenCalledTimes(2));
  });

  it('refreshes directories that are already expanded', async () => {
    getDirectoryTree.mockResolvedValue({
      name: 'workspace',
      path: '/workspace',
      isDirectory: true,
      children: [
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          children: [],
        },
      ],
    });
    getDirectoryChildren
      .mockResolvedValueOnce([
        {
          name: 'before.ts',
          path: '/workspace/src/before.ts',
          isDirectory: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          name: 'after.ts',
          path: '/workspace/src/after.ts',
          isDirectory: false,
        },
      ]);

    const { rerender } = render(
      <ChatFilesystem workspace="/workspace" active />,
    );

    fireEvent.click(await screen.findByText('src'));
    expect(await screen.findByText('before.ts')).toBeInTheDocument();

    rerender(<ChatFilesystem workspace="/workspace" active={false} />);
    rerender(<ChatFilesystem workspace="/workspace" active />);

    expect(await screen.findByText('after.ts')).toBeInTheDocument();
    expect(getDirectoryChildren).toHaveBeenCalledTimes(2);
  });

  it('reads fresh children on every expansion, including previously empty folders', async () => {
    getDirectoryTree.mockResolvedValue({
      name: 'workspace',
      path: '/workspace',
      isDirectory: true,
      children: [
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          children: [],
        },
      ],
    });
    getDirectoryChildren
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: 'new.ts', path: '/workspace/src/new.ts', isDirectory: false },
      ])
      .mockResolvedValueOnce([]);
    render(<ChatFilesystem workspace="/workspace" />);
    const folder = await screen.findByRole('button', { name: 'src' });
    fireEvent.click(folder);
    await waitFor(() => expect(getDirectoryChildren).toHaveBeenCalledTimes(1));
    fireEvent.click(folder);
    expect(getDirectoryChildren).toHaveBeenCalledTimes(1);
    fireEvent.click(folder);
    expect(await screen.findByText('new.ts')).toBeInTheDocument();
    fireEvent.click(folder);
    fireEvent.click(folder);
    await waitFor(() =>
      expect(screen.queryByText('new.ts')).not.toBeInTheDocument(),
    );
    expect(getDirectoryChildren).toHaveBeenCalledTimes(3);
  });

  it('ignores a stale response after a folder is collapsed and reopened', async () => {
    getDirectoryTree.mockResolvedValue({
      name: 'workspace',
      path: '/workspace',
      isDirectory: true,
      children: [
        {
          name: 'src',
          path: '/workspace/src',
          isDirectory: true,
          children: [],
        },
      ],
    });
    let resolveOld: (children: unknown[]) => void;
    getDirectoryChildren
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce([
        {
          name: 'latest.ts',
          path: '/workspace/src/latest.ts',
          isDirectory: false,
        },
      ]);
    render(<ChatFilesystem workspace="/workspace" />);
    const folder = await screen.findByRole('button', { name: 'src' });
    fireEvent.click(folder);
    fireEvent.click(folder);
    fireEvent.click(folder);
    expect(await screen.findByText('latest.ts')).toBeInTheDocument();
    await act(async () => {
      resolveOld([
        {
          name: 'stale.ts',
          path: '/workspace/src/stale.ts',
          isDirectory: false,
        },
      ]);
    });
    expect(screen.getByText('latest.ts')).toBeInTheDocument();
    expect(screen.queryByText('stale.ts')).not.toBeInTheDocument();
  });

  it('opens a requested file and expands its parent directory', async () => {
    getDirectoryTree.mockResolvedValue({
      name: 'workspace',
      path: '/workspace',
      isDirectory: true,
      children: [
        {
          name: 'output',
          path: '/workspace/output',
          isDirectory: true,
          children: [],
        },
      ],
    });
    getDirectoryChildren.mockResolvedValue([
      {
        name: 'report.pdf',
        path: '/workspace/output/report.pdf',
        isDirectory: false,
      },
    ]);
    render(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/output/report.pdf')}
      />,
    );
    expect(await screen.findByTestId('opened-file')).toHaveTextContent(
      '/workspace/output/report.pdf',
    );
    expect(
      await screen.findByRole('button', { name: 'report.pdf' }),
    ).toHaveClass('bg-accent');
  });

  it('defers hidden requests, and can reopen the same file after closing it', async () => {
    const filePreviewRequest = request('/workspace/a.txt');
    const { rerender } = render(
      <ChatFilesystem
        workspace="/workspace"
        active={false}
        filePreviewRequest={filePreviewRequest}
      />,
    );
    expect(screen.queryByTestId('opened-file')).not.toBeInTheDocument();
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={filePreviewRequest}
        />,
      );
    });
    expect(await screen.findByTestId('opened-file')).toHaveTextContent(
      '/workspace/a.txt',
    );
    fireEvent.click(screen.getByText('Close file'));
    expect(screen.queryByTestId('opened-file')).not.toBeInTheDocument();
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={request('/workspace/a.txt')}
        />,
      );
    });
    expect(await screen.findByTestId('opened-file')).toHaveTextContent(
      '/workspace/a.txt',
    );
  });

  it('keeps dirty tabs mounted, deduplicates opens, and confirms only when closing', async () => {
    const { rerender } = render(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/a.txt')}
      />,
    );
    await screen.findByTestId('opened-file');
    fireEvent.click(screen.getByText('Edit file'));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    rerender(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/b.txt')}
      />,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('opened-file')).toHaveLength(2),
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole('tab', { name: 'a.txt chat.file_unsaved' }),
    ).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(
      screen.getByRole('tab', { name: 'a.txt chat.file_unsaved' }),
    );
    expect(
      screen.getByRole('tab', { name: 'a.txt chat.file_unsaved' }),
    ).toHaveAttribute('aria-selected', 'true');
    rerender(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/a.txt')}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'chat.file_close_tab' })[0],
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    confirm.mockReturnValue(true);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'chat.file_close_tab' })[0],
    );
    expect(screen.getByRole('tab', { name: 'b.txt' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('creates a file from the toolbar and opens it in a tab', async () => {
    const mutateWorkspaceEntry = jest
      .fn()
      .mockResolvedValue({ path: '/workspace/new.txt' });
    window.electron.app.mutateWorkspaceEntry = mutateWorkspaceEntry;
    render(<ChatFilesystem workspace="/workspace" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'chat.file_new' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.file_name' }), {
      target: { value: 'new.txt' },
    });
    fireEvent.submit(
      screen.getByRole('textbox', { name: 'chat.file_name' }).closest('form')!,
    );
    await waitFor(() =>
      expect(mutateWorkspaceEntry).toHaveBeenCalledWith({
        workspace: '/workspace',
        path: '/workspace',
        name: 'new.txt',
        action: 'create-file',
      }),
    );
    expect(await screen.findByTestId('opened-file')).toHaveTextContent(
      '/workspace/new.txt',
    );
  });

  it('keeps the operation dialog and shows errors when creation fails', async () => {
    window.electron.app.mutateWorkspaceEntry = jest
      .fn()
      .mockRejectedValue(new Error('Already exists'));
    render(<ChatFilesystem workspace="/workspace" />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'chat.folder_new' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'chat.file_name' }), {
      target: { value: 'src' },
    });
    fireEvent.submit(
      screen.getByRole('textbox', { name: 'chat.file_name' }).closest('form')!,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Already exists',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ignores files outside the current workspace', async () => {
    const { rerender } = render(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/a.txt')}
      />,
    );
    await screen.findByTestId('opened-file');
    fireEvent.click(screen.getByText('Edit file'));
    const confirm = jest.spyOn(window, 'confirm');
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={request('/tmp/report.pdf')}
        />,
      );
    });
    expect(screen.getByTestId('opened-file')).toHaveTextContent(
      '/workspace/a.txt',
    );
    expect(getDirectoryTree).not.toHaveBeenCalledWith('/tmp');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not open a file without a configured workspace', async () => {
    render(<ChatFilesystem filePreviewRequest={request('/tmp/report.pdf')} />);
    expect(screen.queryByTestId('opened-file')).not.toBeInTheDocument();
    expect(getDirectoryTree).not.toHaveBeenCalled();
  });
});
