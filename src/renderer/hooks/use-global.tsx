import { AppInfo, WindowMode, WindowModeState } from '@/types/app';
import { AppChannel } from '@/types/ipc-channel';
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Spinner } from '../components/ui/spinner';

export type SetupStatus = {
  needsSetup: boolean;
  hasProvider: boolean;
  hasDefaultModel: boolean;
  hasRuntime: boolean;
  personalityDisabled: boolean;
};

type GlobalState = {
  appInfo?: AppInfo;
  user?: string;
  setUser: (user?: string) => void;
  getAppInfo: () => Promise<AppInfo>;
  updateDefaultModel: (
    patch: Partial<AppInfo['defaultModel']>,
  ) => Promise<void>;
  setWindowMode: (
    mode: WindowMode,
    persist: boolean,
  ) => Promise<WindowModeState>;
  setupStatus?: SetupStatus;
  getSetupStatus: () => Promise<SetupStatus>;
};

export const GlobalContext = createContext<GlobalState | null>(null);

export function GlobalProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | undefined>();
  const [appInfo, setAppInfo] = useState<AppInfo | undefined>();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | undefined>();
  const appInfoRef = useRef<AppInfo | undefined>(undefined);
  const infoRequestId = useRef(0);
  const modelRevision = useRef(0);
  const pendingModelSaves = useRef(0);
  const savedModels = useRef<AppInfo['defaultModel'] | undefined>(undefined);
  const modelSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const getAppInfo = useCallback(async () => {
    infoRequestId.current += 1;
    const requestId = infoRequestId.current;
    const revision = modelRevision.current;
    const data = await window.electron.app.getInfo();
    if (requestId === infoRequestId.current) {
      const preserveModels =
        pendingModelSaves.current > 0 || revision !== modelRevision.current;
      const next =
        preserveModels && appInfoRef.current
          ? { ...data, defaultModel: appInfoRef.current.defaultModel }
          : data;
      if (!preserveModels) savedModels.current = data.defaultModel;
      appInfoRef.current = next;
      setAppInfo(next);
    }
    return appInfoRef.current ?? data;
  }, []);

  const updateDefaultModel = useCallback(
    async (patch: Partial<AppInfo['defaultModel']>) => {
      if (!appInfoRef.current)
        throw new Error('Application settings have not loaded');
      const change = { ...patch };
      modelRevision.current += 1;
      pendingModelSaves.current += 1;
      const next = {
        ...appInfoRef.current,
        defaultModel: { ...appInfoRef.current.defaultModel, ...change },
      };
      appInfoRef.current = next;
      setAppInfo(next);

      // Merge each change with the latest successfully persisted values, not a render snapshot.
      const save = modelSaveQueue.current
        .then(async () => {
          const defaultModel = { ...savedModels.current, ...change };
          await window.electron.app.saveSettings({
            id: 'defaultModel',
            value: defaultModel,
          });
          savedModels.current = defaultModel;
          return undefined;
        })
        .finally(() => {
          pendingModelSaves.current -= 1;
          modelRevision.current += 1;
          if (pendingModelSaves.current === 0) {
            // Roll back failed changes while retaining any later successful changes.
            const confirmed = {
              ...appInfoRef.current,
              defaultModel: savedModels.current,
            };
            appInfoRef.current = confirmed;
            setAppInfo(confirmed);
          }
        });
      modelSaveQueue.current = save.catch(() => undefined);
      await save;
    },
    [],
  );

  const getSetupStatus = useCallback(async (): Promise<SetupStatus> => {
    const data = await window.electron.app.getSetupStatus();
    setSetupStatus(data);
    return data;
  }, []);

  const updateWindowMode = useCallback((windowMode: WindowModeState) => {
    if (appInfoRef.current) {
      appInfoRef.current = { ...appInfoRef.current, windowMode };
      setAppInfo(appInfoRef.current);
    }
  }, []);

  const setWindowMode = useCallback(
    async (mode: WindowMode, persist: boolean) => {
      const windowMode = await window.electron.app.setWindowMode({
        mode,
        persist,
      });
      updateWindowMode(windowMode);
      return windowMode;
    },
    [updateWindowMode],
  );

  const contextValue = useMemo(
    () => ({
      user,
      setUser,
      appInfo,
      getAppInfo,
      updateDefaultModel,
      setWindowMode,
      setupStatus,
      getSetupStatus,
    }),
    [
      user,
      appInfo,
      getAppInfo,
      updateDefaultModel,
      setWindowMode,
      setupStatus,
      getSetupStatus,
    ],
  );

  const handleToast = useCallback(
    (title, options) => {
      console.log('Toast', title, options);
      const isDark = appInfo?.shouldUseDarkColors;
      toast(title as string, {
        ...options,
        style: isDark
          ? {
              background: '#333',
              color: '#fff',
            }
          : undefined,
      });
    },
    [appInfo?.shouldUseDarkColors],
  );

  useEffect(() => {
    getAppInfo();
    getSetupStatus();
  }, [getAppInfo, getSetupStatus]);

  useEffect(() => {
    window.electron.ipcRenderer.removeAllListeners(AppChannel.Toast);
    window.electron.ipcRenderer.on(AppChannel.Toast, handleToast);
    return () => {
      window.electron.ipcRenderer.removeListener(AppChannel.Toast, handleToast);
    };
  }, [handleToast]);

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      AppChannel.WindowModeChanged,
      (windowMode) => updateWindowMode(windowMode as WindowModeState),
    );
    return unsubscribe;
  }, [updateWindowMode]);

  const isLoading = !appInfo || setupStatus === undefined;

  return (
    <GlobalContext.Provider value={contextValue}>
      {isLoading ? (
        <div className="w-full h-screen flex items-center justify-center">
          <Spinner className="w-[64px] h-[64px]" />
        </div>
      ) : (
        children
      )}
    </GlobalContext.Provider>
  );
}

export const useGlobal = () => {
  const context = useContext(GlobalContext);
  if (!context) {
    throw new Error('useGlobal 必须在 GlobalProvider 内使用');
  }
  return context;
};
