import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('ChatFilesystem', () => {
  beforeEach(() => {
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
});
