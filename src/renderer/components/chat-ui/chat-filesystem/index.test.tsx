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

  it('preserves unsaved edits when a requested file switch is cancelled', async () => {
    const { rerender } = render(
      <ChatFilesystem
        workspace="/workspace"
        filePreviewRequest={request('/workspace/a.txt')}
      />,
    );
    await screen.findByTestId('opened-file');
    fireEvent.click(screen.getByText('Edit file'));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const nextRequest = request('/workspace/report.pdf');
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={nextRequest}
        />,
      );
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('opened-file')).toHaveTextContent(
      '/workspace/a.txt',
    );
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={nextRequest}
        />,
      );
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await act(async () => {
      rerender(
        <ChatFilesystem
          workspace="/workspace"
          filePreviewRequest={request('/workspace/report.pdf')}
        />,
      );
    });
    expect(await screen.findByTestId('opened-file')).toHaveTextContent(
      '/workspace/report.pdf',
    );
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
