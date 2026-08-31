import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AgentOutputPanel } from './agent-output-panel';
import { useAgentSessionStore } from '@/renderer/store/use-agent-session-store';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@/renderer/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/renderer/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe('AgentOutputPanel', () => {
  beforeEach(() => {
    useAgentSessionStore.setState({
      isPanelOpen: true,
      selectedSessionId: 'agent-1',
      order: ['agent-1'],
      sessions: {
        'agent-1': {
          sessionId: 'agent-1',
          subagentThreadId: 'subagent:agent-1',
          description: 'Review implementation',
          prompt: 'Review every changed file',
          subagentType: 'Explore',
          status: 'running',
          isExited: false,
          startTime: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:00:02.000Z',
          messages: [
            {
              id: 'message-1',
              type: 'text',
              content: 'Inspecting the renderer.',
              createdAt: '2026-08-30T00:00:01.000Z',
            },
            {
              id: 'message-2',
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'Read',
              content: '{"file_path":"src/renderer/App.tsx"}',
              createdAt: '2026-08-30T00:00:01.500Z',
            },
            {
              id: 'message-3',
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'Read',
              content: 'App source output',
              createdAt: '2026-08-30T00:00:02.000Z',
            },
          ],
        },
      },
    });
  });

  it('renders every message and tool output in order', () => {
    render(<AgentOutputPanel />);

    const first = screen.getByText('Inspecting the renderer.');
    const second = screen.getByText('{"file_path":"src/renderer/App.tsx"}');
    const third = screen.getByText('App source output');

    expect(first.compareDocumentPosition(second)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(second.compareDocumentPosition(third)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
