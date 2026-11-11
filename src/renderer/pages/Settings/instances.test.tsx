import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Instances from './instances';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/renderer/hooks/use-title', () => ({
  useHeader: () => ({ setTitle: jest.fn() }),
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn() }));

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      instances: {
        getInstances: jest.fn(async () => [
          {
            id: 'default_browser',
            config: { userDataPath: '/browser' },
            tabCount: 0,
            threadCount: 0,
            chromiumVersion: '134',
          },
        ]),
      },
      ipcRenderer: { on: jest.fn(() => jest.fn()) },
    },
  });
});

it('shows the shared browser instance without a per-instance certificate switch', async () => {
  render(<Instances />);
  expect(await screen.findByText('/browser')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});
