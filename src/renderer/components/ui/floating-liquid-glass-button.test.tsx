import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FloatingLiquidGlassButton } from './floating-liquid-glass-button';

class ResizeObserverMock {
  observe = jest.fn();

  disconnect = jest.fn();
}

function installButtonGeometry(button: HTMLButtonElement) {
  Object.assign(button, {
    setPointerCapture: jest.fn(),
    hasPointerCapture: jest.fn(() => true),
    releasePointerCapture: jest.fn(),
  });

  jest.spyOn(button, 'getBoundingClientRect').mockImplementation(() => {
    const width = 180;
    const height = 44;
    const left = button.style.left ? Number.parseFloat(button.style.left) : 16;
    const bottom = button.style.bottom
      ? Number.parseFloat(button.style.bottom)
      : 16;
    const top = button.style.top
      ? Number.parseFloat(button.style.top)
      : window.innerHeight - height - bottom;

    return {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width,
      x: left,
      y: top,
      toJSON: () => ({}),
    };
  });
}

describe('FloatingLiquidGlassButton', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: MouseEvent,
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: ResizeObserverMock,
    });
  });

  it('keeps click behavior when the pointer does not move', () => {
    const onActivate = jest.fn();
    render(
      <FloatingLiquidGlassButton
        floatingId="bash-status"
        initialBottom={16}
        tone="active"
        onActivate={onActivate}
      >
        Bash
      </FloatingLiquidGlassButton>,
    );
    const button = screen.getByRole('button', {
      name: 'Bash',
    }) as HTMLButtonElement;
    installButtonGeometry(button);

    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 30,
      clientY: 550,
      pointerId: 1,
    });
    fireEvent.pointerUp(button, {
      clientX: 30,
      clientY: 550,
      pointerId: 1,
    });
    fireEvent.click(button);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(button.style.bottom).toBe('16px');
  });

  it('snaps a drag to the nearest edge without activating the button', () => {
    const onActivate = jest.fn();
    render(
      <FloatingLiquidGlassButton
        floatingId="ssh-status"
        initialBottom={16}
        tone="active"
        onActivate={onActivate}
      >
        SSH
      </FloatingLiquidGlassButton>,
    );
    const button = screen.getByRole('button', {
      name: 'SSH',
    }) as HTMLButtonElement;
    installButtonGeometry(button);

    fireEvent.pointerDown(button, {
      button: 0,
      clientX: 30,
      clientY: 550,
      pointerId: 2,
    });
    fireEvent.pointerMove(button, {
      clientX: 700,
      clientY: 300,
      pointerId: 2,
    });
    fireEvent.pointerUp(button, {
      clientX: 700,
      clientY: 300,
      pointerId: 2,
    });
    fireEvent.click(button);

    expect(button.style.left).toBe('608px');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('keeps buttons apart when they snap to the same edge', () => {
    render(
      <>
        <FloatingLiquidGlassButton
          floatingId="bash-status"
          initialBottom={16}
          tone="active"
          onActivate={jest.fn()}
        >
          Bash
        </FloatingLiquidGlassButton>
        <FloatingLiquidGlassButton
          floatingId="ssh-status"
          initialBottom={68}
          tone="active"
          onActivate={jest.fn()}
        >
          SSH
        </FloatingLiquidGlassButton>
      </>,
    );
    const bashButton = screen.getByRole('button', {
      name: 'Bash',
    }) as HTMLButtonElement;
    const sshButton = screen.getByRole('button', {
      name: 'SSH',
    }) as HTMLButtonElement;
    installButtonGeometry(bashButton);
    installButtonGeometry(sshButton);

    fireEvent.pointerDown(sshButton, {
      button: 0,
      clientX: 30,
      clientY: 500,
      pointerId: 3,
    });
    fireEvent.pointerMove(sshButton, {
      clientX: 30,
      clientY: 552,
      pointerId: 3,
    });
    fireEvent.pointerUp(sshButton, {
      clientX: 30,
      clientY: 552,
      pointerId: 3,
    });

    const bashRect = bashButton.getBoundingClientRect();
    const sshRect = sshButton.getBoundingClientRect();
    expect(sshRect.bottom + 8).toBeLessThanOrEqual(bashRect.top);
  });
});
