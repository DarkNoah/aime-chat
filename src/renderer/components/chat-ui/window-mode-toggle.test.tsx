import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { WindowModeToggle } from './window-mode-toggle';

const setWindowMode = jest.fn();
let currentMode: 'normal' | 'compact' = 'normal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('../../hooks/use-global', () => ({
  useGlobal: () => ({
    appInfo: {
      windowMode: {
        configured: 'normal',
        current: currentMode,
      },
    },
    setWindowMode,
  }),
}));

describe('WindowModeToggle', () => {
  beforeEach(() => {
    currentMode = 'normal';
    setWindowMode.mockReset().mockResolvedValue({
      configured: 'normal',
      current: 'compact',
    });
  });

  it('temporarily switches from normal to compact mode', async () => {
    render(<WindowModeToggle />);

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.enter_compact_mode' }),
    );

    await waitFor(() => {
      expect(setWindowMode).toHaveBeenCalledWith('compact', false);
    });
  });

  it('temporarily switches from compact to normal mode', async () => {
    currentMode = 'compact';
    render(<WindowModeToggle />);

    fireEvent.click(
      screen.getByRole('button', { name: 'chat.restore_normal_window' }),
    );

    await waitFor(() => {
      expect(setWindowMode).toHaveBeenCalledWith('normal', false);
    });
  });
});
