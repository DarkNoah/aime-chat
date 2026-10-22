import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import toast from 'react-hot-toast';
import RuntimeStep from './RuntimeStep';
import type { RuntimeInfo } from '@/types/app';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    loading: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'setup.runtime.select_runtime') {
        return `select ${values?.name}`;
      }
      if (key === 'setup.runtime.install_and_continue') {
        return `install ${values?.count} and continue`;
      }
      if (key === 'setup.runtime.install_progress') {
        return `installing ${values?.name} ${values?.current}/${values?.total}`;
      }
      if (key === 'setup.runtime.install_complete') {
        return `installed ${values?.count}`;
      }
      return key;
    },
  }),
}));

const getRuntimeInfo = jest.fn<Promise<RuntimeInfo>, []>();
const installRuntime = jest.fn();
const getRuntimeDirectory = jest.fn();
const setRuntimeDirectory = jest.fn();
const showOpenDialog = jest.fn();
const mockedToast = toast as jest.Mocked<typeof toast>;

function createRuntimeInfo(overrides: Partial<RuntimeInfo> = {}): RuntimeInfo {
  return {
    uv: {
      status: 'not_installed',
      installed: false,
      pythonRuntime: {
        installed: false,
      },
    },
    node: {
      status: 'installed',
      installed: true,
      version: 'v22.0.0',
      npmVersion: '10.0.0',
    },
    paddleOcr: {
      status: 'not_installed',
      installed: false,
      mode: 'default',
    },
    bun: {
      status: 'not_installed',
      installed: false,
    },
    qwenAudio: {
      status: 'not_installed',
      installed: false,
    },
    agentBrowser: {
      status: 'not_installed',
      installed: false,
    },
    ...overrides,
  };
}

describe('RuntimeStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRuntimeInfo.mockResolvedValue(createRuntimeInfo());
    getRuntimeDirectory.mockResolvedValue({
      path: '/test/user-data/.runtime',
      defaultPath: '/test/user-data/.runtime',
      canChange: true,
    });
    setRuntimeDirectory.mockImplementation(async (directory: string) => ({
      path: directory,
      defaultPath: '/test/user-data/.runtime',
      canChange: true,
    }));
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    installRuntime.mockImplementation(async (pkg: string) => ({
      status: 'installed',
      installed: true,
      mode: pkg === 'paddleOcr' ? 'default' : undefined,
    }));

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        app: {
          getRuntimeInfo,
          installRuntime,
          getRuntimeDirectory,
          setRuntimeDirectory,
          showOpenDialog,
        },
      },
    });
  });

  it('checks every missing runtime by default and omits installed runtimes', async () => {
    render(<RuntimeStep onNext={jest.fn()} />);

    const uv = await screen.findByRole('checkbox', { name: 'select UV' });
    const paddleOcr = screen.getByRole('checkbox', {
      name: 'select PaddleOCR',
    });

    expect(uv).toBeChecked();
    expect(paddleOcr).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'select Node.js' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('setup.runtime.installed')).toBeInTheDocument();
  });

  it('keeps the PaddleOCR and UV dependency selection valid', async () => {
    render(<RuntimeStep onNext={jest.fn()} />);

    const uv = await screen.findByRole('checkbox', { name: 'select UV' });
    const paddleOcr = screen.getByRole('checkbox', {
      name: 'select PaddleOCR',
    });

    fireEvent.click(uv);
    expect(uv).not.toBeChecked();
    expect(paddleOcr).not.toBeChecked();

    fireEvent.click(paddleOcr);
    expect(uv).toBeChecked();
    expect(paddleOcr).toBeChecked();
  });

  it('saves the directory before continuing and installs in dependency order', async () => {
    const onNext = jest.fn();
    render(<RuntimeStep onNext={onNext} />);

    const continueButton = await screen.findByRole('button', {
      name: /install 2 and continue/i,
    });
    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledTimes(1);
      expect(installRuntime).toHaveBeenCalledTimes(2);
      expect(mockedToast.success).toHaveBeenCalled();
    });
    expect(setRuntimeDirectory).toHaveBeenCalledWith(
      '/test/user-data/.runtime',
    );
    expect(setRuntimeDirectory.mock.invocationCallOrder[0]).toBeLessThan(
      installRuntime.mock.invocationCallOrder[0],
    );

    expect(installRuntime).toHaveBeenNthCalledWith(1, 'uv');
    expect(installRuntime).toHaveBeenNthCalledWith(2, 'paddleOcr');
    expect(mockedToast.loading).toHaveBeenNthCalledWith(
      1,
      'installing UV 1/2',
      {
        id: 'setup-runtime-install',
      },
    );
    expect(mockedToast.loading).toHaveBeenNthCalledWith(
      2,
      'installing PaddleOCR 2/2',
      { id: 'setup-runtime-install' },
    );
  });

  it('prefills the installation directory and supports selection and cancellation', async () => {
    render(<RuntimeStep onNext={jest.fn()} />);
    const input = await screen.findByLabelText(
      'setup.runtime.install_directory',
    );
    expect(input).toHaveValue('/test/user-data/.runtime');
    showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/Volumes/Data/运行 环境'],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'setup.runtime.choose_directory' }),
    );
    await waitFor(() => expect(input).toHaveValue('/Volumes/Data/运行 环境'));
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: '/test/user-data/.runtime',
        properties: ['openDirectory', 'createDirectory'],
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'setup.runtime.choose_directory' }),
    );
    await waitFor(() => expect(showOpenDialog).toHaveBeenCalledTimes(2));
    expect(input).toHaveValue('/Volumes/Data/运行 环境');
    fireEvent.click(
      screen.getByRole('button', { name: /install 2 and continue/i }),
    );
    await waitFor(() => expect(mockedToast.success).toHaveBeenCalled());
    expect(setRuntimeDirectory).toHaveBeenCalledWith('/Volumes/Data/运行 环境');
  });

  it('keeps the wizard on this step when the directory is not writable', async () => {
    const onNext = jest.fn();
    setRuntimeDirectory.mockRejectedValueOnce(
      new Error('RUNTIME_DIRECTORY_NOT_WRITABLE'),
    );
    render(<RuntimeStep onNext={onNext} />);
    fireEvent.change(
      await screen.findByLabelText('setup.runtime.install_directory'),
      {
        target: { value: '/protected/path' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /install 2 and continue/i }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'setup.runtime.directory_save_error',
    );
    expect(installRuntime).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('setup.runtime.install_directory'),
    ).toHaveValue('/protected/path');
  });

  it('does not reinstall dependencies found in the selected directory', async () => {
    const onNext = jest.fn();
    getRuntimeInfo
      .mockResolvedValueOnce(createRuntimeInfo())
      .mockResolvedValueOnce(
        createRuntimeInfo({
          uv: { status: 'installed', installed: true },
          paddleOcr: { status: 'installed', installed: true, mode: 'default' },
        }),
      );
    render(<RuntimeStep onNext={onNext} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /install 2 and continue/i }),
    );
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(getRuntimeInfo).toHaveBeenLastCalledWith(true);
    expect(installRuntime).not.toHaveBeenCalled();
  });

  it('disables directory changes while dependencies already use it', async () => {
    getRuntimeDirectory.mockResolvedValueOnce({
      path: '/existing/runtime',
      defaultPath: '/default',
      canChange: false,
    });
    render(<RuntimeStep onNext={jest.fn()} />);
    expect(
      await screen.findByLabelText('setup.runtime.install_directory'),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'setup.runtime.choose_directory' }),
    ).toBeDisabled();
  });
});
