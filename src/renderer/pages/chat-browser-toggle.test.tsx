import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HeaderProvider } from '../contexts/header-provider';
import { useHeader } from '../hooks/use-title';
import ChatPage from './ChatPage';
import ProjectsPage from './projects';
import { ChatPreviewType } from '@/types/chat';
import { ThreadBrowserChannel } from '@/types/thread-browser';

const mockThread = { id: 'A', title: 'Chat A', metadata: {} };
const mockStore = {
  threadStates: { A: mockThread },
  updateThreadState: jest.fn(),
};
let mockCompact = false;

jest.mock('react-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light' }) }));
jest.mock('../hooks/use-global', () => ({
  useGlobal: () => ({
    appInfo: {
      shouldUseDarkColors: false,
      windowMode: { current: mockCompact ? 'compact' : 'normal' },
    },
  }),
}));
jest.mock('../hooks/use-chat', () => ({
  useChat: () => ({ ensureThread: jest.fn() }),
}));
jest.mock('../store/use-thread-store', () => ({
  useThreadStore: (selector?: (value: typeof mockStore) => unknown) =>
    selector ? selector(mockStore) : mockStore,
}));
jest.mock('../components/chat-ui/chat-panel', () => ({
  ChatPanel: ({ inputActions }: { inputActions?: ReactNode }) => (
    <section>
      <div data-testid="chat-input-toolbar">{inputActions}</div>
      <textarea aria-label="Chat input" />
    </section>
  ),
}));
jest.mock('../components/chat-ui/chat-preview', () => ({
  ChatPreview: ({ previewData }: { previewData: { previewPanel: string } }) => (
    <div data-testid="preview">{previewData.previewPanel}</div>
  ),
}));
jest.mock('../components/chat-project/chat-export-dialog', () => ({
  ProjectChatExportDialog: () => null,
}));
jest.mock('../components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizablePanel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ResizableHandle: () => null,
}));

let listeners: Map<string, Set<(value: any) => void>>;
let tabs: Array<{ id: string }>;
let action: jest.Mock;
beforeEach(() => {
  mockCompact = false;
  tabs = [];
  listeners = new Map();
  action = jest.fn();
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      browser: {
        state: jest.fn(async (threadId) => ({ threadId, tabs, busy: false })),
        action,
      },
      projects: {
        getProject: jest.fn(async () => ({
          id: 'P',
          title: 'Project',
          path: '/project',
        })),
      },
      mastra: { getThreads: jest.fn(async () => ({ items: [mockThread] })) },
      ipcRenderer: {
        on: (channel: string, listener: (value: any) => void) => {
          if (!listeners.has(channel)) listeners.set(channel, new Set());
          listeners.get(channel).add(listener);
          return () => listeners.get(channel).delete(listener);
        },
        removeListener: (channel: string, listener: (value: any) => void) =>
          listeners.get(channel)?.delete(listener),
      },
    },
  });
});

function Toolbar() {
  const { titleAction } = useHeader();
  return <header>{titleAction}</header>;
}

function mount(path: string) {
  return render(
    <HeaderProvider>
      <MemoryRouter initialEntries={[path]}>
        <Toolbar />
        <Routes>
          <Route path="/chat/:threadId" element={<ChatPage />} />
          <Route path="/projects/:id" element={<ProjectsPage />} />
        </Routes>
      </MemoryRouter>
    </HeaderProvider>,
  );
}

function changeTabs(count: number, threadId = 'A') {
  tabs = Array.from({ length: count }, (_, index) => ({ id: `t${index}` }));
  act(() =>
    listeners
      .get(ThreadBrowserChannel.Changed)
      ?.forEach((listener) => listener({ threadId, tabs, busy: false })),
  );
}

it.each(['/chat/A', '/projects/P'])(
  'toggles the actual preview from the browser indicator on %s',
  async (path) => {
    mount(path);
    await waitFor(() =>
      expect(listeners.get(ThreadBrowserChannel.Changed)?.size).toBe(1),
    );
    expect(
      screen.queryByRole('button', { name: /browser\./ }),
    ).not.toBeInTheDocument();
    changeTabs(1, 'B');
    expect(
      screen.queryByRole('button', { name: /browser\./ }),
    ).not.toBeInTheDocument();
    changeTabs(1);
    expect(
      within(screen.getByTestId('chat-input-toolbar')).getByRole('button'),
    ).toHaveTextContent(/^1$/);
    expect(
      within(screen.getByRole('banner')).queryByRole('button', {
        name: /browser\./,
      }),
    ).not.toBeInTheDocument();
    // Projects initially show the filesystem sidebar. An open sidebar must hide.
    expect(screen.queryByTestId('preview')?.textContent ?? null).toBe(
      path.startsWith('/projects') ? ChatPreviewType.FILE_SYSTEM : null,
    );
    if (path.startsWith('/projects')) {
      fireEvent.click(
        screen.getByRole('button', { name: 'browser.hide_running_preview' }),
      );
    }
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'browser.show_running_preview' }),
    );
    expect(screen.getByTestId('preview')).toHaveTextContent(
      ChatPreviewType.WEB_PREVIEW,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'browser.hide_running_preview' }),
    );
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'browser.show_running_preview' }),
    ).toBeInTheDocument();
    changeTabs(0);
    expect(
      screen.queryByRole('button', { name: /browser\./ }),
    ).not.toBeInTheDocument();
    // Closing the last browser tab must not make the remaining sidebar inaccessible.
    fireEvent.click(
      screen.getByRole('button', { name: 'chat.show_preview_sidebar' }),
    );
    expect(screen.getByTestId('preview')).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  },
);

it.each(['/chat/A', '/projects/P'])(
  'keeps preview controls hidden in compact mode on %s',
  async (path) => {
    mockCompact = true;
    tabs = [{ id: 't1' }];
    mount(path);
    await act(async () => {});
    expect(
      screen.queryByRole('button', { name: /browser\./ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  },
);
