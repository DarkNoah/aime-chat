import {
  COMPACT_WINDOW_SIZE,
  COMPACT_WINDOW_MIN_WIDTH,
  NORMAL_WINDOW_SIZE,
  WindowModeController,
  getCompactWindowBounds,
  getCenteredWindowBounds,
  normalizeWindowMode,
} from '../window-mode';

function createWindow(options?: { maximized?: boolean; fullScreen?: boolean }) {
  let maximized = options?.maximized ?? true;
  let fullScreen = options?.fullScreen ?? false;
  let minimumSize: [number, number] = [0, 0];
  return {
    getBounds: jest.fn(() => ({
      x: 20,
      y: 30,
      ...NORMAL_WINDOW_SIZE,
    })),
    getNormalBounds: jest.fn(() => ({
      x: 20,
      y: 30,
      ...NORMAL_WINDOW_SIZE,
    })),
    setBounds: jest.fn(),
    isMaximized: jest.fn(() => maximized),
    maximize: jest.fn(() => {
      maximized = true;
    }),
    unmaximize: jest.fn(() => {
      maximized = false;
    }),
    isFullScreen: jest.fn(() => fullScreen),
    setFullScreen: jest.fn((value: boolean) => {
      fullScreen = value;
    }),
    getMinimumSize: jest.fn(() => minimumSize),
    setMinimumSize: jest.fn((width: number, height: number) => {
      minimumSize = [width, height];
    }),
  };
}

describe('window mode', () => {
  it('uses normal mode for missing or invalid settings', () => {
    expect(normalizeWindowMode(undefined)).toBe('normal');
    expect(normalizeWindowMode('invalid')).toBe('normal');
    expect(normalizeWindowMode('compact')).toBe('compact');
  });

  it('centers and clips a window to the display work area', () => {
    expect(
      getCenteredWindowBounds(COMPACT_WINDOW_SIZE, {
        x: 100,
        y: 50,
        width: 500,
        height: 600,
      }),
    ).toEqual({ x: 100, y: 50, width: 500, height: 600 });
  });

  it('never clips compact window width below 560 pixels', () => {
    expect(
      getCompactWindowBounds({
        x: 100,
        y: 50,
        width: 500,
        height: 600,
      }),
    ).toEqual({
      x: 70,
      y: 50,
      width: COMPACT_WINDOW_MIN_WIDTH,
      height: 600,
    });
  });

  it('uses the configured mode for the initial window size', () => {
    const controller = new WindowModeController({
      getWindow: () => null,
      getWorkArea: () => ({ x: 0, y: 0, width: 1200, height: 900 }),
      persist: jest.fn(),
      emit: jest.fn(),
    });

    controller.initialize('compact');

    expect(controller.getState()).toEqual({
      configured: 'compact',
      current: 'compact',
    });
    expect(controller.getInitialWindowSize()).toEqual(COMPACT_WINDOW_SIZE);
    expect(controller.getInitialMinimumWidth()).toBe(
      COMPACT_WINDOW_MIN_WIDTH,
    );
  });

  it('keeps configured mode unchanged for a temporary switch', async () => {
    const window = createWindow();
    const persist = jest.fn();
    const emit = jest.fn();
    const controller = new WindowModeController({
      getWindow: () => window,
      getWorkArea: () => ({ x: 0, y: 0, width: 1200, height: 900 }),
      persist,
      emit,
    });
    controller.initialize('normal');

    await controller.setMode({ mode: 'compact', persist: false });

    expect(controller.getState()).toEqual({
      configured: 'normal',
      current: 'compact',
    });
    expect(persist).not.toHaveBeenCalled();
    expect(window.setBounds).toHaveBeenCalledWith({
      x: 320,
      y: 90,
      ...COMPACT_WINDOW_SIZE,
    });
    expect(window.setMinimumSize).toHaveBeenCalledWith(
      COMPACT_WINDOW_MIN_WIDTH,
      0,
    );
    expect(emit).toHaveBeenCalledWith({
      configured: 'normal',
      current: 'compact',
    });
  });

  it('persists configured mode and restores the previous normal window', async () => {
    const window = createWindow();
    const persist = jest.fn().mockResolvedValue(undefined);
    const controller = new WindowModeController({
      getWindow: () => window,
      getWorkArea: () => ({ x: 0, y: 0, width: 1200, height: 900 }),
      persist,
      emit: jest.fn(),
    });
    controller.initialize('normal');

    await controller.setMode({ mode: 'compact', persist: true });
    await controller.setMode({ mode: 'normal', persist: false });

    expect(persist).toHaveBeenCalledWith('compact');
    expect(controller.getState()).toEqual({
      configured: 'compact',
      current: 'normal',
    });
    expect(window.setBounds).toHaveBeenLastCalledWith({
      x: 20,
      y: 30,
      ...NORMAL_WINDOW_SIZE,
    });
    expect(window.maximize).toHaveBeenCalledTimes(1);
    expect(window.setMinimumSize).toHaveBeenLastCalledWith(0, 0);
  });

  it('rolls back the window and state when persistence fails', async () => {
    const window = createWindow();
    const controller = new WindowModeController({
      getWindow: () => window,
      getWorkArea: () => ({ x: 0, y: 0, width: 1200, height: 900 }),
      persist: jest.fn().mockRejectedValue(new Error('save failed')),
      emit: jest.fn(),
    });
    controller.initialize('normal');

    await expect(
      controller.setMode({ mode: 'compact', persist: true }),
    ).rejects.toThrow('save failed');

    expect(controller.getState()).toEqual({
      configured: 'normal',
      current: 'normal',
    });
    expect(window.setBounds).toHaveBeenLastCalledWith({
      x: 20,
      y: 30,
      ...NORMAL_WINDOW_SIZE,
    });
  });

  it('restores fullscreen state after returning to normal mode', async () => {
    const window = createWindow({ maximized: false, fullScreen: true });
    const controller = new WindowModeController({
      getWindow: () => window,
      getWorkArea: () => ({ x: 0, y: 0, width: 1200, height: 900 }),
      persist: jest.fn(),
      emit: jest.fn(),
    });
    controller.initialize('normal');

    await controller.setMode({ mode: 'compact', persist: false });
    await controller.setMode({ mode: 'normal', persist: false });

    expect(window.setFullScreen).toHaveBeenNthCalledWith(1, false);
    expect(window.setFullScreen).toHaveBeenNthCalledWith(2, true);
  });
});
