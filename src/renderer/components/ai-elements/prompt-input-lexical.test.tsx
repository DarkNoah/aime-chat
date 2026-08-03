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

describe('PromptInputTextarea skill mentions', () => {
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
});
