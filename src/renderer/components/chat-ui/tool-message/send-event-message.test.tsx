import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolUIPart } from 'ai';
import { SendEventMessage } from './send-event-message';

const sendEvent = jest.fn();
const openPath = jest.fn();
let compact = false;
let workspace: string | undefined = '/tmp';

jest.mock('@/renderer/store/use-thread-store', () => ({
  useThreadStore: (selector: any) =>
    selector({ threadStates: { 'thread-1': { metadata: { workspace } } } }),
}));

jest.mock('@/renderer/hooks/use-chat', () => ({
  useChat: () => ({ sendEvent }),
}));
jest.mock('../chat-preview-visibility', () => ({
  useIsCompactWindow: () => compact,
}));
jest.mock('../../model-viewer', () => ({
  ModelViewer: () => <div>Model preview</div>,
  isSupportedModelFile: () => false,
}));
jest.mock('../../file-icon', () => ({ FileIcon: () => <span /> }));
jest.mock('@/utils/context-utils', () => ({ splitContextAndFiles: jest.fn() }));
jest.mock('react-photo-view', () => ({
  PhotoProvider: ({ children }: any) => children,
  PhotoView: ({ children }: any) => children,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, args?: { name?: string }) =>
      args?.name ? `${key}: ${args.name}` : key,
  }),
}));

const part = {
  type: 'tool-Message',
  toolCallId: 'message-1',
  state: 'output-available',
  input: {
    event: 'files_preview',
    data: JSON.stringify({ files: ['/tmp/report.txt'] }),
  },
  output: 'ok',
} as ToolUIPart;

beforeEach(() => {
  jest.clearAllMocks();
  compact = false;
  workspace = '/tmp';
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      app: {
        openPath,
        getFileInfo: jest.fn(async (path: string) => ({
          path,
          isExist: true,
          isFile: true,
          name: path.split('/').pop(),
          mimeType:
            { png: 'image/png', pdf: 'application/pdf' }[
              path.split('.').pop()
            ] || 'text/plain',
        })),
      },
    },
  });
});

it('opens a document in the filesystem by default', async () => {
  render(<SendEventMessage threadId="thread-1" part={part} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'report.txt /tmp/report.txt' }),
  );
  expect(sendEvent).toHaveBeenCalledWith('thread-1', 'file_preview', {
    filePath: '/tmp/report.txt',
  });
  expect(openPath).not.toHaveBeenCalled();
});

it('reveals a file through the dropdown without firing the default action', async () => {
  render(<SendEventMessage threadId="thread-1" part={part} />);
  const trigger = await screen.findByRole('button', {
    name: 'chat.file_open_options: report.txt',
  });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(
    await screen.findByRole('menuitem', {
      name: 'chat.show_in_system_explorer',
    }),
  );
  expect(openPath).toHaveBeenCalledWith('/tmp/report.txt');
  expect(sendEvent).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(
    await screen.findByRole('menuitem', {
      name: 'chat.open_in_filesystem_default',
    }),
  );
  expect(sendEvent).toHaveBeenCalledTimes(1);
  expect(openPath).toHaveBeenCalledTimes(1);
});

it('keeps image and PDF previews and gives each a file menu', async () => {
  render(
    <SendEventMessage
      threadId="thread-1"
      part={
        {
          ...part,
          input: {
            event: 'files_preview',
            data: JSON.stringify({
              files: ['/tmp/chart.png', '/tmp/report.pdf'],
            }),
          },
        } as ToolUIPart
      }
    />,
  );
  expect(
    await screen.findByRole('img', { name: 'chart.png' }),
  ).toBeInTheDocument();
  expect(screen.getByTitle('report.pdf')).toHaveAttribute(
    'src',
    'file:///tmp/report.pdf',
  );
  expect(
    screen.getAllByRole('button', { name: /^chat.file_open_options:/ }),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'report.pdf' }));
  expect(sendEvent).toHaveBeenCalledWith('thread-1', 'file_preview', {
    filePath: '/tmp/report.pdf',
  });
});

it.each([true, false])(
  'falls back to the explorer when the sidebar is unavailable (compact: %s)',
  async (isCompact) => {
    compact = isCompact;
    render(
      <SendEventMessage
        threadId={isCompact ? 'thread-1' : undefined}
        part={part}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'report.txt /tmp/report.txt' }),
    );
    expect(openPath).toHaveBeenCalledWith('/tmp/report.txt');
    expect(sendEvent).not.toHaveBeenCalled();
  },
);

it.each(['/workspace', undefined])(
  'uses the explorer when the file is outside the workspace (%s)',
  async (currentWorkspace) => {
    workspace = currentWorkspace;
    render(<SendEventMessage threadId="thread-1" part={part} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'report.txt /tmp/report.txt' }),
    );
    expect(openPath).toHaveBeenCalledWith('/tmp/report.txt');
    expect(sendEvent).not.toHaveBeenCalled();
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'chat.file_open_options: report.txt',
      }),
      { key: 'ArrowDown' },
    );
    expect(
      await screen.findByRole('menuitem', {
        name: 'chat.open_in_filesystem_default',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
);
