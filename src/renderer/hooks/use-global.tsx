import { AppInfo } from '@/types/app';
import { AppChannel } from '@/types/ipc-channel';
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Spinner } from '../components/ui/spinner';

type GlobalState = {
  appInfo?: AppInfo;
  user?: string;
  setUser: (user?: string) => void;
  getAppInfo: () => Promise<void>;
};

export const GlobalContext = createContext<GlobalState | null>(null);

export function GlobalProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | undefined>();
  const [appInfo, setAppInfo] = useState<AppInfo | undefined>();

  const getAppInfo = async () => {
    const data = await window.electron.app.getInfo();
    console.log('appInfo', appInfo);
    setAppInfo(data);
  };

  const contextValue = useMemo(
    () => ({ user, setUser, appInfo, getAppInfo }),
    [user, appInfo],
  );

  const handleToast = useCallback(
    (title, options) => {
      console.log('Toast', title, options);
      console.log('appInfo', contextValue.appInfo);
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
    [contextValue],
  );

  useEffect(() => {
    getAppInfo();
    window.electron.ipcRenderer.removeAllListeners(AppChannel.Toast);
    window.electron.ipcRenderer.on(AppChannel.Toast, handleToast);
    return () => {
      window.electron.ipcRenderer.removeListener(AppChannel.Toast, handleToast);
    };
  }, []);

  return (
    <GlobalContext.Provider value={contextValue}>
      {appInfo ? (
        children
      ) : (
        <div className="w-full h-screen flex items-center justify-center">
          <Spinner className="w-[64px] h-[64px]" />
        </div>
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
