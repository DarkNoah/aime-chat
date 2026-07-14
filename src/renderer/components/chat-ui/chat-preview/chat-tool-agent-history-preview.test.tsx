import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { ChatToolAgentHistoryPreview } from './chat-tool-agent-history-preview';

jest.mock('../../ai-elements/message', () => ({
  Message: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MessageContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  MessageResponse: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../../ai-elements/reasoning', () => ({
  Reasoning: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ReasoningContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ReasoningTrigger: () => null,
}));

jest.mock('../tool-message', () => ({
  ToolMessage: () => <div>Tool call</div>,
}));

jest.mock('../chat-message-attachment', () => ({
  ChatMessageAttachment: () => <div>Attachment</div>,
  ChatMessageAttachments: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const getThreadMessages = jest.fn();

const historyResult = (...messages: UIMessage[]) => ({
  total: messages.length,
  hasMore: false,
  page: 0,
  perPage: false,
  messages,
  mastraDBMessages: [],
});

const textMessage = (
  id: string,
  role: UIMessage['role'],
  text: string,
): UIMessage => ({
  id,
  role,
  parts: [{ type: 'text', text }],
});

describe('ChatToolAgentHistoryPreview', () => {
  beforeEach(() => {
    getThreadMessages.mockReset();
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { mastra: { getThreadMessages } },
    });
  });

  it('loads the complete persisted history for the tool call', async () => {
    getThreadMessages.mockResolvedValue(
      historyResult(
        textMessage('user-1', 'user', 'Inspect the repository'),
        textMessage('assistant-1', 'assistant', 'Inspection complete'),
      ),
    );

    render(<ChatToolAgentHistoryPreview toolCallId="tool-1" />);

    expect(
      await screen.findByText('Inspect the repository'),
    ).toBeInTheDocument();
    expect(screen.getByText('Inspection complete')).toBeInTheDocument();
    expect(getThreadMessages).toHaveBeenCalledWith({
      threadId: 'subagent:tool-1',
      perPage: false,
    });
  });

  it('reloads history only when the refresh button is pressed', async () => {
    getThreadMessages
      .mockResolvedValueOnce(
        historyResult(textMessage('assistant-1', 'assistant', 'First result')),
      )
      .mockResolvedValueOnce(
        historyResult(
          textMessage('assistant-2', 'assistant', 'Refreshed result'),
        ),
      );

    render(<ChatToolAgentHistoryPreview toolCallId="tool-2" />);
    expect(await screen.findByText('First result')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh agent history' }),
    );

    expect(await screen.findByText('Refreshed result')).toBeInTheDocument();
    expect(getThreadMessages).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('First result')).not.toBeInTheDocument();
  });

  it('keeps the previous history when a manual refresh fails', async () => {
    getThreadMessages
      .mockResolvedValueOnce(
        historyResult(textMessage('assistant-1', 'assistant', 'Saved result')),
      )
      .mockRejectedValueOnce(new Error('database unavailable'));

    render(<ChatToolAgentHistoryPreview toolCallId="tool-3" />);
    expect(await screen.findByText('Saved result')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh agent history' }),
    );

    expect(
      await screen.findByText('Unable to load agent history.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved result')).toBeInTheDocument();
  });

  it('shows an empty state when the thread has no messages', async () => {
    getThreadMessages.mockResolvedValue(historyResult());

    render(<ChatToolAgentHistoryPreview toolCallId="tool-empty" />);

    expect(
      await screen.findByText('No agent history found.'),
    ).toBeInTheDocument();
  });

  it('ignores an older response after the tool call changes', async () => {
    let resolveOldRequest: (value: ReturnType<typeof historyResult>) => void;
    getThreadMessages
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldRequest = resolve;
          }),
      )
      .mockResolvedValueOnce(
        historyResult(textMessage('assistant-new', 'assistant', 'New history')),
      );

    const { rerender } = render(
      <ChatToolAgentHistoryPreview toolCallId="tool-old" />,
    );
    rerender(<ChatToolAgentHistoryPreview toolCallId="tool-new" />);
    expect(await screen.findByText('New history')).toBeInTheDocument();

    await act(async () => {
      resolveOldRequest!(
        historyResult(textMessage('assistant-old', 'assistant', 'Old history')),
      );
    });

    expect(screen.queryByText('Old history')).not.toBeInTheDocument();
    expect(screen.getByText('New history')).toBeInTheDocument();
  });
});
