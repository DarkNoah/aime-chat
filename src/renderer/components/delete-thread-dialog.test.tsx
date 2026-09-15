import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { StorageThreadType } from '@mastra/core/memory';
import { DeleteThreadDialog } from './delete-thread-dialog';

jest.mock('i18next', () => ({
  t: (key: string, options?: { error?: string }) => options?.error ?? key,
}));

const thread: StorageThreadType = {
  id: 'thread-1',
  resourceId: 'default',
  title: 'My chat',
  metadata: { workspace: '/data/threads/thread-1' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DeleteThreadDialog', () => {
  it('preserves the workspace by default', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(
      <DeleteThreadDialog
        thread={thread}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'common.delete_chat_workspace' }),
    ).not.toBeChecked();
    expect(screen.getByText('/data/threads/thread-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith('thread-1', {
      deleteWorkspace: false,
    });
  });

  it('passes explicit consent and blocks repeated submission while deleting', async () => {
    let finish: () => void;
    const onDelete = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = jest.fn();
    render(
      <DeleteThreadDialog
        thread={thread}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    const deleteButton = screen.getByRole('button', {
      name: 'common.deleting',
    });
    expect(deleteButton).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'common.cancel' }),
    ).toBeDisabled();
    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('thread-1', {
      deleteWorkspace: true,
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog and selection available for retry on failure', async () => {
    const onDelete = jest
      .fn()
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce(undefined);
    const onClose = jest.fn();
    render(
      <DeleteThreadDialog
        thread={thread}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Permission denied',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenLastCalledWith('thread-1', {
      deleteWorkspace: true,
    });
  });

  it.each([
    { ...thread, resourceId: 'project:project-1' },
    { ...thread, metadata: {} },
  ])(
    'never offers workspace deletion for a project or absent workspace',
    async (item) => {
      const onDelete = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();
      render(
        <DeleteThreadDialog
          thread={item}
          onDelete={onDelete}
          onClose={onClose}
        />,
      );

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onDelete).toHaveBeenCalledWith('thread-1', {
        deleteWorkspace: false,
      });
    },
  );

  it('cancels without deleting and resets consent when reopened', () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    const { unmount } = render(
      <DeleteThreadDialog
        thread={thread}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    unmount();

    render(
      <DeleteThreadDialog
        thread={thread}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
