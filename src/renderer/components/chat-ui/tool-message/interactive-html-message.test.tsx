import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { ToolUIPart } from 'ai';
import {
  buildInteractiveHtmlDocument,
  INTERACTIVE_HTML_MESSAGE_SOURCE,
  INTERACTIVE_HTML_RESIZE_MESSAGE,
  INTERACTIVE_HTML_RESUME_MESSAGE,
  InteractiveHtmlMessage,
} from './interactive-html-message';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { error?: string }) =>
      options?.error ? `${key}: ${options.error}` : key,
  }),
}));

const part = {
  type: 'tool-InteractiveHtml',
  toolCallId: 'tool-call-1',
  state: 'input-available',
  input: {
    html: '<button>Continue</button>',
    tips: 'Review the values before continuing.',
  },
} as unknown as ToolUIPart;

describe('InteractiveHtmlMessage', () => {
  it('shows optional tips above the interactive content', () => {
    render(<InteractiveHtmlMessage part={part} />);

    expect(screen.queryByText('tools.interactive_html_tips')).not.toBeNull();
    expect(
      screen.queryByText('Review the values before continuing.'),
    ).not.toBeNull();
  });

  it('builds a sandbox document with the interaction bridge and CSP', () => {
    const document = buildInteractiveHtmlDocument('<button>Continue</button>');

    expect(document).toContain('Content-Security-Policy');
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("window, 'aimeChat'");
    expect(document).toContain(
      'if (event.target instanceof HTMLFormElement) event.preventDefault();',
    );
    expect(document).toContain('}, true);');
    expect(document).toContain('<button>Continue</button>');
  });

  it('accepts resize messages and resumes only once with normalized data', () => {
    const onResume = jest.fn();
    render(
      <InteractiveHtmlMessage
        part={part}
        suspendedData={{ runId: 'run-1' }}
        onResume={onResume}
      />,
    );

    const iframe = screen.getByTitle('tools.interactive_html_title');
    const source = (iframe as HTMLIFrameElement).contentWindow;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source,
          data: {
            source: INTERACTIVE_HTML_MESSAGE_SOURCE,
            type: INTERACTIVE_HTML_RESIZE_MESSAGE,
            height: 240,
          },
        }),
      );
    });
    expect((iframe as HTMLIFrameElement).style.height).toBe('240px');

    const resumeMessage = new MessageEvent('message', {
      source,
      data: {
        source: INTERACTIVE_HTML_MESSAGE_SOURCE,
        type: INTERACTIVE_HTML_RESUME_MESSAGE,
        resumeData: { answer: 'yes', values: [1, 2] },
      },
    });

    act(() => {
      window.dispatchEvent(resumeMessage);
      window.dispatchEvent(resumeMessage);
    });

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith({ answer: 'yes', values: [1, 2] });
    expect(
      screen.queryByText('tools.interactive_html_submitted'),
    ).not.toBeNull();
  });

  it('rejects non-object resume data', () => {
    const onResume = jest.fn();
    render(
      <InteractiveHtmlMessage
        part={part}
        suspendedData={{ runId: 'run-1' }}
        onResume={onResume}
      />,
    );

    const iframe = screen.getByTitle('tools.interactive_html_title');
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: (iframe as HTMLIFrameElement).contentWindow,
          data: {
            source: INTERACTIVE_HTML_MESSAGE_SOURCE,
            type: INTERACTIVE_HTML_RESUME_MESSAGE,
            resumeData: ['not', 'an', 'object'],
          },
        }),
      );
    });

    expect(onResume).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        'tools.interactive_html_error: tools.interactive_html_invalid_resume_data',
      ),
    ).not.toBeNull();
  });
});
