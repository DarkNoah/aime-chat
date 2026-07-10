import type { Rectangle } from 'electron';
import { SetWindowModeInput, WindowMode, WindowModeState } from '@/types/app';

export const NORMAL_WINDOW_SIZE = {
  width: 1024,
  height: 728,
} as const;

export const COMPACT_WINDOW_SIZE = {
  width: 560,
  height: 720,
} as const;

export type WindowModeWindow = {
  getBounds: () => Rectangle;
  getNormalBounds: () => Rectangle;
  setBounds: (bounds: Rectangle) => void;
  isMaximized: () => boolean;
  maximize: () => void;
  unmaximize: () => void;
  isFullScreen: () => boolean;
  setFullScreen: (fullScreen: boolean) => void;
};

type NormalWindowSnapshot = {
  bounds: Rectangle;
  wasMaximized: boolean;
  wasFullScreen: boolean;
};

type WindowModeControllerOptions = {
  getWindow: () => WindowModeWindow | null;
  getWorkArea: (bounds: Rectangle) => Rectangle;
  persist: (mode: WindowMode) => Promise<void>;
  emit: (state: WindowModeState) => void;
};

const exitExpandedWindowStates = (window: WindowModeWindow) => {
  if (window.isFullScreen()) {
    window.setFullScreen(false);
  }
  if (window.isMaximized()) {
    window.unmaximize();
  }
};

export const normalizeWindowMode = (value: unknown): WindowMode =>
  value === 'compact' ? 'compact' : 'normal';

export const getWindowSize = (mode: WindowMode) =>
  mode === 'compact' ? COMPACT_WINDOW_SIZE : NORMAL_WINDOW_SIZE;

export const getCenteredWindowBounds = (
  size: { width: number; height: number },
  workArea: Rectangle,
): Rectangle => {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);

  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height,
  };
};

export class WindowModeController {
  private state: WindowModeState = {
    configured: 'normal',
    current: 'normal',
  };

  private normalWindowSnapshot?: NormalWindowSnapshot;

  private readonly getWindow: WindowModeControllerOptions['getWindow'];

  private readonly getWorkArea: WindowModeControllerOptions['getWorkArea'];

  private readonly persist: WindowModeControllerOptions['persist'];

  private readonly emit: WindowModeControllerOptions['emit'];

  constructor(options: WindowModeControllerOptions) {
    this.getWindow = options.getWindow;
    this.getWorkArea = options.getWorkArea;
    this.persist = options.persist;
    this.emit = options.emit;
  }

  initialize(configuredMode: unknown) {
    const mode = normalizeWindowMode(configuredMode);
    this.state = { configured: mode, current: mode };
    this.normalWindowSnapshot = undefined;
  }

  getState(): WindowModeState {
    return { ...this.state };
  }

  getInitialWindowSize() {
    return getWindowSize(this.state.current);
  }

  async setMode(input: SetWindowModeInput): Promise<WindowModeState> {
    if (input.mode !== 'normal' && input.mode !== 'compact') {
      throw new Error(`Unsupported window mode: ${String(input.mode)}`);
    }

    const previousState = this.getState();
    const previousSnapshot = this.normalWindowSnapshot;
    const currentChanged = input.mode !== previousState.current;
    const configuredChanged =
      input.persist && input.mode !== previousState.configured;

    if (!currentChanged && !configuredChanged) {
      return this.getState();
    }

    if (currentChanged) {
      try {
        this.applyMode(input.mode);
        this.state = { ...this.state, current: input.mode };
      } catch (error) {
        this.normalWindowSnapshot = previousSnapshot;
        throw error;
      }
    }

    if (configuredChanged) {
      try {
        await this.persist(input.mode);
        this.state = { ...this.state, configured: input.mode };
      } catch (error) {
        if (currentChanged) {
          try {
            this.applyMode(previousState.current);
          } finally {
            this.normalWindowSnapshot = previousSnapshot;
          }
        }
        this.state = previousState;
        throw error;
      }
    }

    const state = this.getState();
    this.emit(state);
    return state;
  }

  private applyMode(mode: WindowMode) {
    const window = this.getWindow();
    if (!window) {
      return;
    }

    if (mode === 'compact') {
      if (this.state.current !== 'compact') {
        this.normalWindowSnapshot = {
          bounds: window.getNormalBounds(),
          wasMaximized: window.isMaximized(),
          wasFullScreen: window.isFullScreen(),
        };
      }

      exitExpandedWindowStates(window);
      const anchorBounds =
        this.normalWindowSnapshot?.bounds ?? window.getBounds();
      window.setBounds(
        getCenteredWindowBounds(
          COMPACT_WINDOW_SIZE,
          this.getWorkArea(anchorBounds),
        ),
      );
      return;
    }

    exitExpandedWindowStates(window);
    const snapshot = this.normalWindowSnapshot;
    const normalBounds =
      snapshot?.bounds ??
      getCenteredWindowBounds(
        NORMAL_WINDOW_SIZE,
        this.getWorkArea(window.getBounds()),
      );
    window.setBounds(normalBounds);
    this.normalWindowSnapshot = undefined;

    if (snapshot?.wasFullScreen) {
      window.setFullScreen(true);
    } else if (snapshot?.wasMaximized) {
      window.maximize();
    }
  }
}
