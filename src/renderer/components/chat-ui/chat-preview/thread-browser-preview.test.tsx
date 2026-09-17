import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ThreadBrowserPreview } from './thread-browser-preview';
import { ThreadBrowserChannel } from '@/types/thread-browser';
import type { ThreadBrowserState } from '@/types/thread-browser';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const initial: ThreadBrowserState = {
  threadId: 'A',
  busy: false,
  selectedTabId: 't1',
  automationTabId: 't1',
  tabs: [
    {
      id: 't1',
      title: 'First page',
      url: 'https://example.com/',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    },
  ],
};
let listeners: Map<string, (value: any) => void>;
let action: jest.Mock;
let present: jest.Mock;
let overlays: HTMLElement[];

function mockBounds(
  element: HTMLElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const rect = {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: jest.fn(() => rect),
  });
  // Chromium returns a rect even for an empty 0 x 0 popper wrapper.
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: jest.fn(() => [rect]),
  });
}

function popper(role = 'tooltip') {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-radix-popper-content-wrapper', '');
  const content = document.createElement('div');
  content.setAttribute('role', role);
  content.textContent = 'Navigation item';
  wrapper.append(content);
  mockBounds(wrapper, 0, 0, 0, 0);
  mockBounds(content, 40, 140, 100, 30);
  overlays.push(wrapper);
  document.body.append(wrapper);
  return { wrapper, content };
}

async function flushOverlays() {
  // Let MutationObserver schedule the visibility update before the next frame.
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function renderVisiblePreview() {
  render(<ThreadBrowserPreview threadId="A" active />);
  await waitFor(() =>
    expect(present).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true }),
    ),
  );
  present.mockClear();
}

beforeEach(() => {
  listeners = new Map();
  overlays = [];
  action = jest.fn(async () => initial);
  present = jest.fn(async () => undefined);
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      browser: { state: jest.fn(async () => initial), action, present },
      ipcRenderer: {
        on: (name: string, listener: (value: any) => void) => {
          listeners.set(name, listener);
          return () => listeners.delete(name);
        },
      },
    },
  });
  Object.defineProperty(global.crypto, 'randomUUID', {
    configurable: true,
    value: () => 'preview-owner',
  });
  global.ResizeObserver = class {
    observe = jest.fn();

    unobserve = jest.fn();

    disconnect = jest.fn();
  };
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 120,
    width: 700,
    height: 500,
    top: 120,
    left: 20,
    bottom: 620,
    right: 720,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  overlays.forEach((overlay) => overlay.remove());
  jest.restoreAllMocks();
});

it.each([
  'hidden',
  'empty',
  'invisible',
  'outside',
  'touching',
  'empty wrapper',
])('keeps the webpage visible for a %s sidebar tooltip', async (kind) => {
  await renderVisiblePreview();
  const { wrapper, content } = popper();
  if (kind === 'hidden') content.hidden = true;
  if (kind === 'empty') mockBounds(content, 40, 140, 0, 0);
  if (kind === 'invisible') wrapper.style.visibility = 'hidden';
  if (kind === 'outside') mockBounds(content, 0, 10, 100, 30);
  if (kind === 'touching') mockBounds(content, 0, 140, 20, 30);
  if (kind === 'empty wrapper') content.remove();
  await flushOverlays();
  expect(present).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});

it.each(['tooltip', 'menu', 'dialog'])(
  'hides for an overlapping %s and restores the webpage when it moves away',
  async (role) => {
    await renderVisiblePreview();
    const { wrapper, content } = popper(role);
    await flushOverlays();
    expect(present).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: false }),
    );
    mockBounds(content, 0, 10, 100, 30);
    wrapper.style.transform = 'translate(0px, 10px)';
    await flushOverlays();
    expect(present).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true }),
    );
    wrapper.remove();
    await flushOverlays();
    expect(action).not.toHaveBeenCalled();
  },
);

it.each(['dialog', 'alertdialog'])(
  'keeps modal protection for a %s outside the webpage and restores on close',
  async (role) => {
    await renderVisiblePreview();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', role);
    mockBounds(dialog, 0, 10, 100, 30);
    overlays.push(dialog);
    document.body.append(dialog);
    await flushOverlays();
    expect(present).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: false }),
    );
    dialog.remove();
    await flushOverlays();
    expect(present).toHaveBeenLastCalledWith(
      expect.objectContaining({ visible: true }),
    );
    expect(action).not.toHaveBeenCalled();
  },
);

it('shows owned tabs and routes navigation to the displayed tab', async () => {
  render(<ThreadBrowserPreview threadId="A" active />);
  expect(
    await screen.findByRole('tab', { name: /First page/ }),
  ).toHaveAttribute('aria-selected', 'true');
  fireEvent.change(screen.getByRole('textbox', { name: 'browser.address' }), {
    target: { value: 'https://next.example/' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'browser.go' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      threadId: 'A',
      action: 'navigate',
      tabId: 't1',
      url: 'https://next.example/',
    }),
  );
});

it('ignores other threads and hides the native view on unmount without closing tabs', async () => {
  const view = render(<ThreadBrowserPreview threadId="A" active />);
  await screen.findByRole('tab', { name: /First page/ });
  listeners.get(ThreadBrowserChannel.Changed)?.({
    ...initial,
    threadId: 'B',
    tabs: [],
  });
  expect(screen.getByRole('tab', { name: /First page/ })).toBeInTheDocument();
  await waitFor(() =>
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'A', visible: true }),
    ),
  );
  view.unmount();
  expect(present).toHaveBeenLastCalledWith({
    threadId: 'A',
    ownerId: 'preview-owner',
    visible: false,
  });
  expect(action).not.toHaveBeenCalled();
  expect(listeners.size).toBe(0);
});

it("does not open an old thread's preview request in the current thread", async () => {
  render(
    <ThreadBrowserPreview
      threadId="A"
      active
      request={{ threadId: 'B', url: 'https://wrong.example' }}
    />,
  );
  await screen.findByRole('tab', { name: /First page/ });
  expect(action).not.toHaveBeenCalled();
});

it('stops the running tab when it differs from the selected automation tab', async () => {
  render(<ThreadBrowserPreview threadId="A" active />);
  await screen.findByRole('tab', { name: /First page/ });
  act(() =>
    listeners.get(ThreadBrowserChannel.Changed)?.({
      ...initial,
      busy: true,
      runningTabId: 't2',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'browser.stop' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      threadId: 'A',
      action: 'stop',
      tabId: 't2',
      url: undefined,
    }),
  );
});
