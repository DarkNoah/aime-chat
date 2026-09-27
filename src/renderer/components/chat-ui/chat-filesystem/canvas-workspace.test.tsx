import '@testing-library/jest-dom';
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CanvasWorkspace } from './canvas-workspace';

const listeners: Record<string, () => void> = {};
const editor = {
  updateViewportScreenBounds: jest.fn(),
  focus: jest.fn(),
  blur: jest.fn(),
  getContainer: jest.fn(),
  store: {
    listen: jest.fn((callback, options) => {
      listeners[options.scope] = callback;
      return () => {
        delete listeners[options.scope];
      };
    }),
  },
  getSelectedShapeIds: jest.fn(() => ['shape:one']),
  toImage: jest.fn(),
  user: { updateUserPreferences: jest.fn() },
};
const serialize = jest.fn();
const parse = jest.fn();
jest.mock('tldraw', () => ({
  Tldraw: ({ onMount }: any) => {
    React.useEffect(() => {
      return onMount(editor);
    }, [onMount]);
    return <button onClick={() => listeners.document?.()}>Draw</button>;
  },
  serializeTldrawJson: (...args: any[]) => serialize(...args),
}));
jest.mock('./tldraw-document', () => ({
  CANVAS_FILE_LIMIT: 32 * 1024 * 1024,
  parseCanvasDocument: (...args: any[]) => parse(...args),
  assertEmbeddedCanvasAssets: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));
const read = jest.fn();
const write = jest.fn();
const onDirtyChange = jest.fn();
const addImage = jest.fn();
const close = jest.fn();
function setup(active = true) {
  return render(
    <CanvasWorkspace
      filePath="/workspace/art.tldr"
      workspace="/workspace"
      active={active}
      onDirtyChange={onDirtyChange}
      onClose={close}
      onAddImageToChat={addImage}
    />,
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  editor.getContainer.mockImplementation(() => screen.getByText('Draw'));
  editor.store.listen.mockImplementation((callback, options) => {
    listeners[options.scope] = callback;
    return () => {
      delete listeners[options.scope];
    };
  });
  parse.mockReturnValue({});
  read.mockResolvedValue({
    content: '{"records":[]}',
    size: 14,
    truncated: false,
    isBinary: false,
  });
  write.mockResolvedValue({ size: 14 });
  serialize.mockResolvedValue('{"records":[]}');
  editor.getSelectedShapeIds.mockReturnValue(['shape:one']);
  editor.toImage.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
  });
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { app: { readFileContent: read, writeFileContent: write } },
  });
});

it('loads and edits the canvas, saving with the existing workspace IPC', async () => {
  setup();
  await screen.findByText('Draw');
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.click(screen.getByText('Draw'));
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() =>
    expect(write).toHaveBeenCalledWith(
      '/workspace/art.tldr',
      '{"records":[]}',
      '/workspace',
    ),
  );
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
});

it('keeps changes made while a save is in flight dirty', async () => {
  let complete!: () => void;
  write.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  setup();
  await screen.findByText('Draw');
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.click(screen.getByText('Draw'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(write).toHaveBeenCalled());
  fireEvent.click(screen.getByText('Draw'));
  await act(async () => complete());
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
});

it('keeps the draft and displays save failures', async () => {
  write.mockRejectedValue(new Error('Disk full'));
  setup();
  await screen.findByText('Draw');
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.click(screen.getByText('Draw'));
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
});

it.each([{ truncated: true }, { isBinary: true }, { content: '' }])(
  'does not open or overwrite unreadable content: %j',
  async (overrides) => {
    read.mockResolvedValue({
      content: '{}',
      size: 2,
      truncated: false,
      isBinary: false,
      ...overrides,
    });
    setup();
    await screen.findByRole('alert');
    expect(screen.queryByText('Draw')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
  },
);

it('exports only selected shapes directly to a base64 attachment without local paths', async () => {
  setup();
  await screen.findByText('Draw');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'chat.canvas_add_selection' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'chat.canvas_add_selection' }),
  );
  await waitFor(() =>
    expect(addImage).toHaveBeenCalledWith({
      type: 'file',
      mediaType: 'image/png',
      filename: 'art-selection.png',
      url: 'data:image/png;base64,cG5n',
    }),
  );
  expect(editor.toImage).toHaveBeenCalledWith(
    ['shape:one'],
    expect.objectContaining({ format: 'png' }),
  );
  expect(write).not.toHaveBeenCalled();
});

it('requires a selection and does not silently export the whole page', async () => {
  editor.getSelectedShapeIds.mockReturnValue([]);
  setup();
  await screen.findByText('Draw');
  expect(
    screen.getByRole('button', { name: 'chat.canvas_add_selection' }),
  ).toBeDisabled();
});

it('ignores save shortcuts in inactive tabs', async () => {
  setup(false);
  await screen.findByText('Draw');
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.click(screen.getByText('Draw'));
  fireEvent.keyDown(window, { key: 's', ctrlKey: true });
  expect(write).not.toHaveBeenCalled();
});

it('keeps export errors in the canvas without creating an attachment', async () => {
  editor.toImage.mockRejectedValue(new Error('Image unavailable'));
  setup();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'chat.canvas_add_selection' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'chat.canvas_add_selection' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Image unavailable',
  );
  expect(addImage).not.toHaveBeenCalled();
});

it('asks before closing a dirty canvas and preserves it when cancelled', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  setup();
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.click(screen.getByText('Draw'));
  fireEvent.click(screen.getByRole('button', { name: 'chat.file_close_tab' }));
  expect(confirm).toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  confirm.mockRestore();
});

it('gives canvas keyboard focus only while interacting with the active canvas', async () => {
  const view = setup();
  await waitFor(() => expect(listeners.document).toBeDefined());
  fireEvent.pointerDown(screen.getByText('Draw'));
  expect(editor.focus).toHaveBeenCalledWith({ focusContainer: false });
  fireEvent.pointerDown(document.body);
  expect(editor.blur).toHaveBeenCalledWith({ blurContainer: false });
  editor.blur.mockClear();
  view.rerender(
    <CanvasWorkspace
      filePath="/workspace/art.tldr"
      workspace="/workspace"
      active={false}
      onDirtyChange={onDirtyChange}
      onClose={close}
    />,
  );
  expect(editor.blur).toHaveBeenCalledWith({ blurContainer: false });
});
