/* eslint-disable react/jsx-no-useless-fragment, react/prop-types */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { WindowModeSetting } from './window-mode-setting';

const setWindowMode = jest.fn();

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
        current: 'compact',
      },
    },
    setWindowMode,
  }),
}));

jest.mock('../../components/ui/select', () => ({
  Select: ({ children, onValueChange }) => (
    <button
      type="button"
      data-testid="window-mode-select"
      onClick={() => onValueChange('compact')}
    >
      {children}
    </button>
  ),
  SelectContent: ({ children }) => <>{children}</>,
  SelectGroup: ({ children }) => <>{children}</>,
  SelectItem: ({ children }) => <>{children}</>,
  SelectTrigger: ({ children }) => <>{children}</>,
  SelectValue: () => null,
}));

describe('WindowModeSetting', () => {
  beforeEach(() => {
    setWindowMode.mockReset().mockResolvedValue({
      configured: 'compact',
      current: 'compact',
    });
  });

  it('persists the selected mode and explains a temporary override', async () => {
    render(<WindowModeSetting />);

    expect(
      screen.getByText('settings.window_mode_temporary_override'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('window-mode-select'));

    await waitFor(() => {
      expect(setWindowMode).toHaveBeenCalledWith('compact', true);
    });
  });
});
