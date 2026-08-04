import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  type PromptInputSlashItem,
  usePromptInputController,
} from './prompt-input';
import { SlashMentionMenu, SlashMentionMenuItem } from './prompt-input-lexical';
import { CHAT_FILE_REFERENCE_MIME_TYPE } from '@/renderer/lib/chat-file-reference';

const getFileInfo = jest.fn();
const getPathForFile = jest.fn();
const getClipboardFilePaths = jest.fn();

jest.mock('nanoid', () => ({
  nanoid: () => 'test-id',
}));

jest.mock('lexical-beautiful-mentions', () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    })),
  });
  return jest.requireActual('lexical-beautiful-mentions');
});

const slashItems: PromptInputSlashItem[] = [
  {
    id: 'goal',
    label: 'goal',
    group: 'commands',
  },
  {
    id: 'compact',
    label: 'compact',
    group: 'commands',
    instant: true,
  },
  {
    id: 'skill:local:agent-browser',
    label: 'Agent Browser',
    description: 'Browse websites with the installed skill.',
    group: 'skills',
  },
];

function SetSlashInputButton() {
  const controller = usePromptInputController();
  return (
    <button type="button" onClick={() => controller.textInput.setInput('/')}>
      Set slash input
    </button>
  );
}

function PromptInputValue() {
  const controller = usePromptInputController();
  return (
    <output data-testid="prompt-input-value">
      {controller.textInput.value}
    </output>
  );
}

describe('PromptInputTextarea mentions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getClipboardFilePaths.mockReturnValue([]);
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        app: {
          getClipboardFilePaths,
          getFileInfo,
          getPathForFile,
        },
      },
    });
  });

  it('renders an upward menu grouped into common commands and skills', () => {
    const { container } = render(
      <SlashMentionMenu role="menu">
        <SlashMentionMenuItem
          selected={false}
          item={{
            trigger: '/',
            value: 'goal',
            displayValue: 'goal',
            data: {
              displayLabel: 'goal',
              description: 'Create a goal.',
              mentionKind: 'command',
            },
          }}
          itemValue="goal"
          label="goal"
        />
        <SlashMentionMenuItem
          selected={false}
          item={{
            trigger: '/',
            value: 'skill:local:agent-browser',
            displayValue: 'Agent Browser',
            data: {
              displayLabel: 'Agent Browser',
              description: 'Browse websites with the installed skill.',
              mentionKind: 'skill',
            },
          }}
          itemValue="skill:local:agent-browser"
          label="Agent Browser"
        />
      </SlashMentionMenu>,
    );

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('bottom-full');
    expect(screen.getByText('常用')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.queryByText('SKILL')).toBeNull();
    expect(screen.queryByText('CMD')).toBeNull();
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('restores a matching skill command as a friendly tag with canonical text', async () => {
    const handleSubmit = jest.fn();
    const renderInput = (items: PromptInputSlashItem[]) => (
      <PromptInputProvider initialInput="/skill:local:agent-browser open example.com">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea slashItems={items} />
          <button type="submit">Send</button>
        </PromptInput>
      </PromptInputProvider>
    );
    const { container, rerender } = render(
      renderInput(slashItems.filter((item) => item.group !== 'skills')),
    );

    expect(container.querySelector('[data-beautiful-mention]')).toBeNull();
    rerender(renderInput(slashItems));

    expect(await screen.findByText('/Agent Browser')).toBeTruthy();

    await waitFor(() => {
      expect(
        container
          .querySelector('[data-beautiful-mention]')
          ?.getAttribute('data-beautiful-mention'),
      ).toBe('/skill:local:agent-browser');
    });
    expect(screen.getByText('open example.com')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '/skill:local:agent-browser open example.com',
        }),
        expect.anything(),
      );
    });
  });

  it('leaves built-in slash commands as plain text', async () => {
    const { container } = render(
      <PromptInputProvider initialInput="/goal">
        <PromptInputTextarea slashItems={slashItems} />
      </PromptInputProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-beautiful-mention]')).toBeNull();
    });
    expect(screen.getByText('/goal')).toBeTruthy();
  });

  it('executes an instant command and clears it from the editor', async () => {
    const handleSlashItemSelect = jest.fn();
    render(
      <PromptInputProvider>
        <PromptInputTextarea
          onSlashItemSelect={handleSlashItemSelect}
          slashItems={slashItems}
        />
        <SetSlashInputButton />
      </PromptInputProvider>,
    );

    const editor = screen.getByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'Set slash input' }));
    fireEvent.focus(editor);

    const compactItem = await screen.findByRole('menuitem', {
      name: 'Choose compact',
    });
    fireEvent.click(compactItem);

    await waitFor(() => {
      expect(handleSlashItemSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'compact', instant: true }),
      );
      expect(editor.textContent).toBe('');
    });
  });

  it('keeps goal as a normal command for the user to complete', async () => {
    const handleSlashItemSelect = jest.fn();
    render(
      <PromptInputProvider>
        <PromptInputTextarea
          onSlashItemSelect={handleSlashItemSelect}
          slashItems={slashItems}
        />
        <SetSlashInputButton />
      </PromptInputProvider>,
    );

    const editor = screen.getByRole('textbox');
    fireEvent.click(screen.getByRole('button', { name: 'Set slash input' }));
    fireEvent.focus(editor);
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Choose goal' }),
    );

    await waitFor(() => {
      expect(handleSlashItemSelect).not.toHaveBeenCalled();
      expect(editor.textContent).toBe('/goal ');
    });
  });

  it('renders a pasted absolute path as a file mention and submits its full path', async () => {
    const handleSubmit = jest.fn();
    const path = '/Volumes/Data/project notes/roadmap.md';
    getFileInfo.mockResolvedValue({
      isExist: true,
      isFile: true,
      path,
      name: 'roadmap.md',
    });
    const { container } = render(
      <PromptInputProvider>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea />
          <button type="submit">Send file</button>
        </PromptInput>
      </PromptInputProvider>,
    );

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        items: [],
        getData: () => path,
      },
    });

    const mention = await screen.findByLabelText('File roadmap.md');
    expect(mention.getAttribute('data-file-reference')).toBe(path);
    expect(mention.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('[data-beautiful-mention]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send file' }));
    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ text: path }),
        expect.anything(),
      );
    });
  });

  it('renders a chat filesystem drop as a folder mention', async () => {
    const reference = {
      serializedPath: '"./project notes"',
      sourcePath: '/Volumes/Data/workspace/project notes',
      name: 'project notes',
      kind: 'directory' as const,
    };
    render(
      <PromptInputProvider>
        <PromptInputTextarea />
      </PromptInputProvider>,
    );

    fireEvent.drop(screen.getByRole('textbox'), {
      dataTransfer: {
        getData: (type: string) =>
          type === CHAT_FILE_REFERENCE_MIME_TYPE
            ? JSON.stringify(reference)
            : '',
      },
    });

    const mention = await screen.findByLabelText('Folder project notes');
    expect(mention.getAttribute('data-file-reference')).toBe(
      reference.sourcePath,
    );
    expect(mention.querySelector('svg')).toBeTruthy();
  });

  it('reads copied OS files from clipboardData.files', async () => {
    const path = 'C:\\Users\\Noah\\Documents\\brief.docx';
    const file = new File(['brief'], 'brief.docx');
    getPathForFile.mockReturnValue(path);
    getFileInfo.mockResolvedValue({
      isExist: true,
      isFile: true,
      path,
      name: path,
    });
    render(
      <PromptInputProvider>
        <PromptInputTextarea />
      </PromptInputProvider>,
    );

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [file],
        items: [],
        getData: () => '',
      },
    });

    const mention = await screen.findByLabelText('File brief.docx');
    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(mention.getAttribute('data-file-reference')).toBe(path);
    expect(screen.getByRole('textbox').textContent).toBe('brief.docx');
  });

  it('falls back to file URI clipboard data from desktop file managers', async () => {
    const path = '/Users/noah/Project Notes/brief.md';
    getFileInfo.mockResolvedValue({
      isExist: true,
      isFile: true,
      path,
      name: 'brief.md',
    });
    render(
      <PromptInputProvider>
        <PromptInputTextarea />
      </PromptInputProvider>,
    );

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [],
        items: [],
        getData: (type: string) =>
          type === 'text/uri-list'
            ? 'file:///Users/noah/Project%20Notes/brief.md'
            : '',
      },
    });

    const mention = await screen.findByLabelText('File brief.md');
    expect(getFileInfo).toHaveBeenCalledWith(path);
    expect(mention.getAttribute('data-file-reference')).toBe(path);
  });

  it('reads copied files from the native Electron clipboard fallback', async () => {
    const path = '/Users/noah/Project Notes/native-brief.md';
    getClipboardFilePaths.mockReturnValue([path]);
    getFileInfo.mockResolvedValue({
      isExist: true,
      isFile: true,
      path,
      name: 'native-brief.md',
    });
    render(
      <PromptInputProvider>
        <PromptInputTextarea />
      </PromptInputProvider>,
    );

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [],
        items: [],
        getData: () => '',
      },
    });

    const mention = await screen.findByLabelText('File native-brief.md');
    expect(getClipboardFilePaths).toHaveBeenCalledTimes(1);
    expect(mention.getAttribute('data-file-reference')).toBe(path);
  });

  it('submits with Enter and keeps Shift+Enter for a line break', async () => {
    const handleSubmit = jest.fn();
    render(
      <PromptInputProvider initialInput="Send this message">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea />
          <button type="submit">Send</button>
        </PromptInput>
        <PromptInputValue />
      </PromptInputProvider>,
    );

    const editor = screen.getByRole('textbox');
    fireEvent.focus(editor);
    fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });
    expect(handleSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('prompt-input-value').textContent).toBe(
        'Send this message\n',
      );
    });

    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Send this message\n' }),
        expect.anything(),
      );
    });
  });

  it('renders a system file drop through the shared inline-file path', async () => {
    const path = '/Volumes/Data/reference.pdf';
    const file = new File(['pdf'], 'reference.pdf', {
      type: 'application/pdf',
    });
    getPathForFile.mockReturnValue(path);
    getFileInfo.mockResolvedValue({
      isExist: true,
      isFile: true,
      path,
      name: path,
    });
    render(
      <PromptInputProvider>
        <PromptInput onSubmit={jest.fn()}>
          <PromptInputTextarea />
        </PromptInput>
      </PromptInputProvider>,
    );

    fireEvent.drop(screen.getByRole('textbox'), {
      dataTransfer: {
        files: [file],
        getData: () => '',
        items: [],
        types: ['Files'],
      },
    });

    const mention = await screen.findByLabelText('File reference.pdf');
    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(mention.getAttribute('data-file-reference')).toBe(path);
    expect(screen.getByRole('textbox').textContent).toBe('reference.pdf');
  });
});
