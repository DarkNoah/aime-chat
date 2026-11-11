import '@testing-library/jest-dom';
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import toast from 'react-hot-toast';
import RuntimeMigration from './runtime-migration';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));
const getRuntimeDirectory = jest.fn();
const migrateRuntimeDirectory = jest.fn();
const showOpenDialog = jest.fn();
const prefix = 'settings.runtime_page.';
beforeEach(() => {
  jest.clearAllMocks();
  getRuntimeDirectory.mockResolvedValue({
    path: '/old',
    defaultPath: '/test/user-data/.runtime',
    canChange: false,
  });
  migrateRuntimeDirectory.mockResolvedValue(undefined);
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/new'] });
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      app: { getRuntimeDirectory, migrateRuntimeDirectory, showOpenDialog },
    },
  });
});

async function selectNewDirectory() {
  await screen.findByText('/old');
  fireEvent.click(
    screen.getByRole('button', {
      name: /settings\.runtime_page\.change_directory/,
    }),
  );
  return screen.findByRole('alertdialog');
}

it('has one directory action and migrates only after confirming the selected target', async () => {
  const onBusyChange = jest.fn();
  render(<RuntimeMigration busy={false} onBusyChange={onBusyChange} />);
  await screen.findByText('/old');
  expect(screen.getAllByRole('button')).toHaveLength(1);
  const dialog = await selectNewDirectory();
  expect(showOpenDialog).toHaveBeenCalledWith(
    expect.objectContaining({ defaultPath: '/test/user-data/.runtime' }),
  );
  expect(within(dialog).getByText('/old')).toBeInTheDocument();
  expect(within(dialog).getByText('/new')).toBeInTheDocument();
  expect(migrateRuntimeDirectory).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole('button', { name: `${prefix}migrate_restart` }),
  );
  await waitFor(() =>
    expect(migrateRuntimeDirectory).toHaveBeenCalledWith('/new'),
  );
  expect(
    screen.getByRole('button', {
      name: /settings\.runtime_page\.change_directory/,
    }),
  ).toBeDisabled();
  expect(
    await screen.findByText(`${prefix}migration_phases.restarting`),
  ).toBeInTheDocument();
  expect(onBusyChange).toHaveBeenCalledWith(true);
});

it('cancels confirmation without changing the current environment', async () => {
  render(<RuntimeMigration busy={false} onBusyChange={jest.fn()} />);
  const dialog = await selectNewDirectory();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'common.cancel' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
  );
  expect(migrateRuntimeDirectory).not.toHaveBeenCalled();
  expect(screen.getByText('/old')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

it.each([
  { canceled: true, filePaths: [] },
  { canceled: false, filePaths: ['/old'] },
])(
  'does not migrate a cancelled or unchanged folder selection: %p',
  async (selection) => {
    showOpenDialog.mockResolvedValue(selection);
    render(<RuntimeMigration busy={false} onBusyChange={jest.fn()} />);
    await screen.findByText('/old');
    fireEvent.click(
      screen.getByRole('button', {
        name: /settings\.runtime_page\.change_directory/,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /settings\.runtime_page\.change_directory/,
        }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(migrateRuntimeDirectory).not.toHaveBeenCalled();
  },
);

it('shows a recoverable failure and re-enables the directory action', async () => {
  migrateRuntimeDirectory.mockRejectedValue(
    new Error('RUNTIME_MIGRATION_VERIFY_FAILED'),
  );
  render(<RuntimeMigration busy={false} onBusyChange={jest.fn()} />);
  const dialog = await selectNewDirectory();
  fireEvent.click(
    within(dialog).getByRole('button', { name: `${prefix}migrate_restart` }),
  );
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      `${prefix}migration_errors.RUNTIME_MIGRATION_VERIFY_FAILED`,
    ),
  );
  expect(
    screen.getByRole('button', {
      name: /settings\.runtime_page\.change_directory/,
    }),
  ).toBeEnabled();
  expect(screen.getByText('/old')).toBeInTheDocument();
});

it('allows retrying when the native directory picker fails', async () => {
  showOpenDialog.mockRejectedValueOnce(new Error('dialog unavailable'));
  render(<RuntimeMigration busy={false} onBusyChange={jest.fn()} />);
  await screen.findByText('/old');
  const button = screen.getByRole('button', {
    name: /settings\.runtime_page\.change_directory/,
  });
  fireEvent.click(button);
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(`${prefix}directory_select_error`),
  );
  expect(button).toBeEnabled();
  expect(migrateRuntimeDirectory).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
});

it('confirms cleanup recovery using the saved target without opening a directory picker', async () => {
  getRuntimeDirectory.mockResolvedValue({
    path: '/new',
    defaultPath: '/test/user-data/.runtime',
    canChange: false,
    migration: { destination: '/new', phase: 'cleaning', cleanupPending: true },
  });
  render(<RuntimeMigration busy={false} onBusyChange={jest.fn()} />);
  await screen.findByRole('alert');
  fireEvent.click(
    screen.getByRole('button', { name: `${prefix}retry_cleanup` }),
  );
  const dialog = await screen.findByRole('alertdialog');
  expect(showOpenDialog).not.toHaveBeenCalled();
  expect(migrateRuntimeDirectory).not.toHaveBeenCalled();
  expect(within(dialog).getByText('/new')).toBeInTheDocument();
  fireEvent.click(
    within(dialog).getByRole('button', { name: `${prefix}retry_cleanup` }),
  );
  await waitFor(() =>
    expect(migrateRuntimeDirectory).toHaveBeenCalledWith('/new'),
  );
});

it('prevents switching directories while installation is active', async () => {
  render(<RuntimeMigration busy onBusyChange={jest.fn()} />);
  await screen.findByText('/old');
  expect(
    screen.getByRole('button', {
      name: /settings\.runtime_page\.change_directory/,
    }),
  ).toBeDisabled();
});
