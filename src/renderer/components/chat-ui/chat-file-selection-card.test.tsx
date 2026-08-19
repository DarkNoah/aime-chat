import { fireEvent, render, screen } from '@testing-library/react';
import type { ChatFileSelectionReference } from '@/renderer/lib/chat-file-selection';
import { ChatFileSelectionCard } from './chat-file-selection-card';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'chat.file_selection_region') {
        return `${options?.fileName} 文件选区`;
      }
      if (key === 'chat.file_selection_lines') {
        return `${options?.start}\u2013${options?.end} 行`;
      }
      const messages: Record<string, string> = {
        'chat.file_selection_markdown': 'Markdown 选区',
        'chat.file_selection_expand': '展开选区',
        'chat.file_selection_collapse': '收起选区',
      };
      return messages[key] ?? key;
    },
  }),
}));

const createReference = (
  overrides: Partial<ChatFileSelectionReference> = {},
): ChatFileSelectionReference => ({
  serializedText: '',
  selectedText: 'const answer = 42;',
  sourcePath: '/Volumes/Data/workspace/aime-chat/src/example.ts',
  ...overrides,
});

describe('ChatFileSelectionCard', () => {
  it('shows the basename and selected line range', () => {
    render(
      <ChatFileSelectionCard
        reference={createReference({ startLine: 8, endLine: 10 })}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'example.ts 文件选区' }),
    ).toBeTruthy();
    expect(screen.getByText('example.ts')).toBeTruthy();
    expect(screen.getByText('8\u201310 行')).toBeTruthy();
    expect(screen.queryByText('Markdown 选区')).toBeNull();
  });

  it('uses the Markdown selection label when line numbers are absent', () => {
    render(<ChatFileSelectionCard reference={createReference()} />);

    expect(screen.getByText('Markdown 选区')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('collapses selections longer than six lines and expands them on demand', () => {
    const selectedText = Array.from(
      { length: 8 },
      (_, index) => `line ${index + 1}`,
    ).join('\n');
    render(
      <ChatFileSelectionCard reference={createReference({ selectedText })} />,
    );

    const content = screen.getByTestId('file-selection-content');
    const toggle = screen.getByRole('button', { name: '展开选区' });
    expect(content.textContent).toContain('line 6');
    expect(content.textContent).not.toContain('line 7');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(content.id);

    fireEvent.click(toggle);

    expect(content.textContent).toContain('line 8');
    expect(
      screen
        .getByRole('button', { name: '收起选区' })
        .getAttribute('aria-expanded'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '收起选区' }));
    expect(content.textContent).not.toContain('line 7');
  });

  it('renders special source text as literal text', () => {
    const selectedText = '<tag data-value="a & b">{value}</tag>';
    render(
      <ChatFileSelectionCard
        reference={createReference({
          selectedText,
          sourcePath: 'C:\\workspace\\README.md',
        })}
      />,
    );

    expect(screen.getByText('README.md')).toBeTruthy();
    expect(screen.getByTestId('file-selection-content').textContent).toBe(
      selectedText,
    );
    expect(document.querySelector('tag')).toBeNull();
  });
});
