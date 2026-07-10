import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChatPreviewVisibility } from './chat-preview-visibility';

let currentMode: 'normal' | 'compact' = 'normal';

jest.mock('../../hooks/use-global', () => ({
  useGlobal: () => ({
    appInfo: {
      windowMode: {
        configured: currentMode,
        current: currentMode,
      },
    },
  }),
}));

describe('ChatPreviewVisibility', () => {
  it('does not render preview content in compact mode', () => {
    currentMode = 'compact';

    render(
      <ChatPreviewVisibility>
        <div>Preview panel</div>
      </ChatPreviewVisibility>,
    );

    expect(screen.queryByText('Preview panel')).not.toBeInTheDocument();
  });

  it('respects local preview visibility in normal mode', () => {
    currentMode = 'normal';
    const { rerender } = render(
      <ChatPreviewVisibility visible={false}>
        <div>Preview panel</div>
      </ChatPreviewVisibility>,
    );

    expect(screen.queryByText('Preview panel')).not.toBeInTheDocument();

    rerender(
      <ChatPreviewVisibility visible>
        <div>Preview panel</div>
      </ChatPreviewVisibility>,
    );
    expect(screen.getByText('Preview panel')).toBeInTheDocument();
  });
});
