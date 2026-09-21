import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ChatBrowserToggle } from './chat-browser-toggle';
import {
  ThreadBrowserChannel,
  type ThreadBrowserState,
} from '@/types/thread-browser';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: { count: number }) => `${key} (${values.count})`,
  }),
}));

function browserState(threadId = 'A', count = 0): ThreadBrowserState {
  return {
    threadId,
    busy: false,
    tabs: Array.from({ length: count }, (_, index) => ({
      id: `t${index + 1}`,
      title: 'Page',
      url: 'https://example.com',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    })),
  };
}

let listeners: Set<(value: ThreadBrowserState) => void>;
let state: jest.Mock;
let action: jest.Mock;

beforeEach(() => {
  listeners = new Set();
  state = jest.fn(async (threadId) => browserState(threadId));
  action = jest.fn();
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      browser: { state, action },
      ipcRenderer: {
        on: jest.fn((channel, listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }),
      },
    },
  });
});

function emit(value: ThreadBrowserState) {
  act(() => listeners.forEach((listener) => listener(value)));
}

it('tracks new and closed tabs only for the current thread while preview is hidden', async () => {
  render(<ChatBrowserToggle threadId="A" open={false} onToggle={jest.fn()} />);
  await act(async () => {});
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  emit(browserState('B', 2));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  emit(browserState('A', 1));
  expect(screen.getByRole('button')).toHaveAccessibleName(
    'browser.show_running_preview (1)',
  );
  expect(screen.getByRole('button')).toHaveTextContent(/^1$/);
  emit(browserState('A', 2));
  expect(screen.getByRole('button')).toHaveAccessibleName(
    'browser.show_running_preview (2)',
  );
  expect(screen.getByRole('button')).toHaveTextContent(/^2$/);
  emit(browserState('A', 1));
  expect(screen.getByRole('button')).toHaveTextContent(/^1$/);
  emit(browserState('A'));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('restores the indicator for existing tabs and toggles without opening or closing tabs', async () => {
  state.mockResolvedValue(browserState('A', 1));
  const toggle = jest.fn();
  const view = render(
    <ChatBrowserToggle threadId="A" open={false} onToggle={toggle} />,
  );
  const button = await screen.findByRole('button');
  expect(button).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(button);
  view.rerender(<ChatBrowserToggle threadId="A" open onToggle={toggle} />);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(button).toHaveAccessibleName('browser.hide_running_preview (1)');
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledTimes(2);
  expect(action).not.toHaveBeenCalled();
  expect(state).toHaveBeenCalledTimes(1);
});

it('ignores an initial snapshot that arrives after a newer tab-close event', async () => {
  let resolveInitial: (value: ThreadBrowserState) => void;
  state.mockReturnValue(
    new Promise<ThreadBrowserState>((resolve) => {
      resolveInitial = resolve;
    }),
  );
  render(<ChatBrowserToggle threadId="A" open={false} onToggle={jest.fn()} />);
  emit(browserState('A', 1));
  emit(browserState('A'));
  await act(async () => {
    resolveInitial(browserState('A', 1));
  });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('cleans up subscriptions and ignores late responses when switching threads', async () => {
  let resolveA: (value: ThreadBrowserState) => void;
  state.mockImplementation((threadId) =>
    threadId === 'A'
      ? new Promise<ThreadBrowserState>((resolve) => {
          resolveA = resolve;
        })
      : Promise.resolve(browserState(threadId)),
  );
  const view = render(
    <ChatBrowserToggle threadId="A" open={false} onToggle={jest.fn()} />,
  );
  emit(browserState('A', 2));
  view.rerender(
    <ChatBrowserToggle threadId="B" open={false} onToggle={jest.fn()} />,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await act(async () => {
    resolveA(browserState('A', 2));
  });
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(listeners.size).toBe(1);
  emit(browserState('B', 1));
  expect(screen.getByRole('button')).toBeInTheDocument();
  view.unmount();
  expect(listeners.size).toBe(0);
});

it('continues to receive tab events if the initial state request fails', async () => {
  state.mockRejectedValue(new Error('Unavailable'));
  render(<ChatBrowserToggle threadId="A" open={false} onToggle={jest.fn()} />);
  await waitFor(() => expect(state).toHaveBeenCalled());
  emit(browserState('A', 1));
  expect(screen.getByRole('button')).toBeInTheDocument();
});

it('does not subscribe or render without a thread or browser API', () => {
  const view = render(<ChatBrowserToggle open={false} onToggle={jest.fn()} />);
  expect(state).not.toHaveBeenCalled();
  window.electron.browser = undefined;
  view.rerender(
    <ChatBrowserToggle threadId="A" open={false} onToggle={jest.fn()} />,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(listeners.size).toBe(0);
});
