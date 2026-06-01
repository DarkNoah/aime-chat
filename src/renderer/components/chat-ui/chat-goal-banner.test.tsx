import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ChatGoalBanner } from './chat-goal-banner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

jest.mock('./chat-goal', () => ({
  ChatGoal: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('ChatGoalBanner', () => {
  it('renders a sticky active goal summary when goal is enabled', () => {
    render(
      <ChatGoalBanner
        goal={{
          enable: true,
          objective: 'Keep working until the UI exposes the active goal.',
          status: 'pending',
        }}
      />,
    );

    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(
      screen.getByText('Keep working until the UI exposes the active goal.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('chat-goal-banner')).toHaveClass('sticky');
  });

  it('does not render when goal is disabled or empty', () => {
    const { rerender } = render(
      <ChatGoalBanner
        goal={{
          enable: false,
          objective: 'Hidden goal',
          status: 'pending',
        }}
      />,
    );

    expect(screen.queryByTestId('chat-goal-banner')).not.toBeInTheDocument();

    rerender(
      <ChatGoalBanner
        goal={{
          enable: true,
          objective: '   ',
          status: 'pending',
        }}
      />,
    );

    expect(screen.queryByTestId('chat-goal-banner')).not.toBeInTheDocument();
  });

  it('keeps completed goals visible after the active guard is disabled', () => {
    render(
      <ChatGoalBanner
        goal={{
          enable: false,
          objective: 'Ship the goal banner.',
          status: 'complete',
        }}
      />,
    );

    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Ship the goal banner.')).toBeInTheDocument();
  });
});
