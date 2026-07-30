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

  it('continues immediately and installs selected runtimes in dependency order', async () => {
    const onNext = jest.fn();
    render(<RuntimeStep onNext={onNext} />);

    const continueButton = await screen.findByRole('button', {
      name: /install 2 and continue/i,
    });
    fireEvent.click(continueButton);

    expect(onNext).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(installRuntime).toHaveBeenCalledTimes(2);
      expect(mockedToast.success).toHaveBeenCalled();
    });

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
});
