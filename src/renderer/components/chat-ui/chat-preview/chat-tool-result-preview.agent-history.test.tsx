import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ToolUIPart } from 'ai';
import { ChatToolResultPreview } from './chat-tool-result-preview';

jest.mock('../../ai-elements/streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../chat-message-attachment', () => ({
  ChatMessageAttachment: () => null,
  ChatMessageAttachments: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('./chat-tool-generate-image-preview', () => ({
  ChatToolGenerateImagePreview: () => null,
}));

jest.mock('./chat-tool-bash-preview', () => ({
  ChatToolBashPreview: () => null,
}));

jest.mock('./chat-tool-ssh-preview', () => ({
  ChatToolSSHPreview: () => null,
}));

jest.mock('./chat-tool-agent-history-preview', () => ({
  ChatToolAgentHistoryPreview: ({ toolCallId }: { toolCallId: string }) => (
    <div data-testid="agent-history-preview">{toolCallId}</div>
  ),
}));

describe('ChatToolResultPreview Agent history', () => {
  it('mounts the dedicated history UI for an Agent tool call', () => {
    const part = {
      type: 'tool-Agent',
      toolCallId: 'agent-tool-1',
      state: 'input-available',
      input: {
        description: 'Inspect files',
        prompt: 'Inspect the repository',
        subagent_type: 'general-purpose',
      },
    } as unknown as ToolUIPart;

    render(<ChatToolResultPreview part={part} />);

    expect(screen.getByTestId('agent-history-preview')).toHaveTextContent(
      'agent-tool-1',
    );
  });
});
