import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Instances from './instances';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/renderer/hooks/use-title', () => ({
  useHeader: () => ({ setTitle: jest.fn() }),
}));
jest.mock('react-hot-toast', () => ({ success: jest.fn() }));

let enabled: boolean;
let save: jest.Mock;
const info = () => ({
  id: 'default_browser',
  config: { userDataPath: '/browser', insecureTls: enabled },
  tabCount: 0,
  threadCount: 0,
  chromiumVersion: '134',
  insecureTlsRestartRequired: enabled,
});

beforeEach(() => {
  enabled = false;
  save = jest.fn(async (_id: string, value: boolean) => {
    enabled = value;
    return info();
  });
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      instances: {
        getInstances: jest.fn(async () => [info()]),
        setInsecureTls: save,
      },
      ipcRenderer: { on: jest.fn(() => jest.fn()) },
    },
  });
});

it('loads the saved setting and saves both switch directions for the browser instance', async () => {
  render(<Instances />);
  const toggle = await screen.findByRole('switch', {
    name: 'settings.browser_insecure_tls',
  });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toBeChecked());
  expect(screen.getByRole('status')).toHaveTextContent(
    'settings.browser_tls_restart_required',
  );
  expect(save).toHaveBeenLastCalledWith('default_browser', true);
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(
    screen.queryByText('settings.browser_tls_restart_required'),
  ).not.toBeInTheDocument();
  expect(save).toHaveBeenLastCalledWith('default_browser', false);
});

it('shows a saved enabled setting on mount', async () => {
  enabled = true;
  render(<Instances />);
  expect(await screen.findByRole('switch')).toBeChecked();
});

it('keeps the previous switch state and shows a save failure', async () => {
  save.mockRejectedValueOnce(new Error('disk full'));
  render(<Instances />);
  const toggle = await screen.findByRole('switch');
  fireEvent.click(toggle);
  expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
  expect(toggle).not.toBeChecked();
  expect(toggle).toBeEnabled();
});
