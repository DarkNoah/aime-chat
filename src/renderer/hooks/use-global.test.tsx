import { act, render, waitFor } from '@testing-library/react';
import { GlobalProvider, useGlobal } from './use-global';

jest.mock('react-hot-toast', () => ({ toast: jest.fn(), Toaster: () => null }));
jest.mock('../components/ui/spinner', () => ({
  Spinner: () => <div>Loading</div>,
}));

function deferred<T = any>() {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe('global default model updates', () => {
  let state: ReturnType<typeof useGlobal>;
  const getInfo = jest.fn();
  const saveSettings = jest.fn();
  const initial = {
    defaultModel: {
      model: 'chat/old',
      fastModel: 'fast/old',
      generateVideoModel: 'video/old',
    },
  };
  function Consumer() {
    state = useGlobal();
    return <div>{state.appInfo?.defaultModel.model}</div>;
  }
  async function mount() {
    render(
      <GlobalProvider>
        <Consumer />
      </GlobalProvider>,
    );
    await waitFor(() => expect(state?.appInfo).toEqual(initial));
  }
  beforeEach(() => {
    state = undefined;
    jest.clearAllMocks();
    getInfo.mockResolvedValue(initial);
    saveSettings.mockResolvedValue(undefined);
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        app: {
          getInfo,
          saveSettings,
          getSetupStatus: jest.fn().mockResolvedValue({ needsSetup: false }),
        },
        ipcRenderer: {
          on: jest.fn(() => () => undefined),
          removeAllListeners: jest.fn(),
          removeListener: jest.fn(),
        },
      },
    });
  });

  it('updates all consumers immediately and serializes changes without losing other fields', async () => {
    await mount();
    const firstSave = deferred<void>();
    saveSettings.mockReturnValueOnce(firstSave.promise);
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = state.updateDefaultModel({ model: 'chat/new' });
      second = state.updateDefaultModel({ generateVideoModel: 'video/new' });
    });
    expect(state.appInfo.defaultModel).toEqual({
      ...initial.defaultModel,
      model: 'chat/new',
      generateVideoModel: 'video/new',
    });
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstSave.resolve();
      await Promise.all([first, second]);
    });
    expect(saveSettings).toHaveBeenNthCalledWith(2, {
      id: 'defaultModel',
      value: {
        ...initial.defaultModel,
        model: 'chat/new',
        generateVideoModel: 'video/new',
      },
    });
  });

  it('keeps the latest selection when the same field changes rapidly', async () => {
    await mount();
    let writes: Promise<void>[];
    act(() => {
      writes = [
        state.updateDefaultModel({ model: 'chat/A' }),
        state.updateDefaultModel({ model: 'chat/B' }),
        state.updateDefaultModel({ model: '' }),
      ];
    });
    await act(async () => {
      await Promise.all(writes);
    });
    expect(state.appInfo.defaultModel.model).toBe('');
    expect(saveSettings).toHaveBeenLastCalledWith({
      id: 'defaultModel',
      value: { ...initial.defaultModel, model: '' },
    });
  });

  it('discards an older info response that arrives after a newer response', async () => {
    await mount();
    const oldRead = deferred();
    const newRead = deferred();
    getInfo
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);
    const oldRequest = state.getAppInfo();
    const newRequest = state.getAppInfo();
    const latest = {
      defaultModel: { ...initial.defaultModel, model: 'chat/latest' },
    };
    await act(async () => {
      newRead.resolve(latest);
      await newRequest;
    });
    await act(async () => {
      oldRead.resolve(initial);
      await oldRequest;
    });
    expect(state.appInfo).toEqual(latest);
  });

  it('does not let a pre-save info request overwrite a confirmed selection', async () => {
    await mount();
    const oldRead = deferred();
    getInfo.mockReturnValueOnce(oldRead.promise);
    const request = state.getAppInfo();
    await act(async () => {
      await state.updateDefaultModel({ model: 'chat/new' });
    });
    await act(async () => {
      oldRead.resolve(initial);
      await request;
    });
    expect(state.appInfo.defaultModel.model).toBe('chat/new');
  });

  it('preserves optimistic selections if info refreshes while a save is pending', async () => {
    await mount();
    const pending = deferred<void>();
    saveSettings.mockReturnValueOnce(pending.promise);
    let saving: Promise<void>;
    act(() => {
      saving = state.updateDefaultModel({ generateVideoModel: 'video/new' });
    });
    await act(async () => {
      await state.getAppInfo();
    });
    expect(state.appInfo.defaultModel.generateVideoModel).toBe('video/new');
    await act(async () => {
      pending.resolve();
      await saving;
    });
  });

  it('rolls back a failed save and allows later changes to succeed', async () => {
    await mount();
    saveSettings.mockRejectedValueOnce(new Error('database unavailable'));
    let failed: Promise<unknown>;
    let succeeded: Promise<void>;
    act(() => {
      failed = state
        .updateDefaultModel({ model: 'chat/failed' })
        .catch((error) => error);
      succeeded = state.updateDefaultModel({ generateVideoModel: 'video/new' });
    });
    await act(async () => {
      expect(await failed).toEqual(new Error('database unavailable'));
      await succeeded;
    });
    expect(state.appInfo.defaultModel).toEqual({
      ...initial.defaultModel,
      generateVideoModel: 'video/new',
    });
    expect(saveSettings).toHaveBeenLastCalledWith({
      id: 'defaultModel',
      value: { ...initial.defaultModel, generateVideoModel: 'video/new' },
    });
  });
});
