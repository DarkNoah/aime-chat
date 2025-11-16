import { AppInfo } from '@/types/app';
import { AppChannel } from '@/types/ipc-channel';
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useEffect,
} from 'react';
import { toast } from 'sonner';
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
    setAppInfo(data);
  };

  useEffect(() => {
    getAppInfo();
    const handleSend = (title, message) => {
      toast(title as string, {
        description: message,
        // action: {
        //   label: 'Undo',
        //   onClick: () => console.log('Undo'),
        // },
        closeButton: true,
      });
    };
    window.electron.ipcRenderer.on(AppChannel.Send, handleSend);
    return () => {
      window.electron.ipcRenderer.removeListener(AppChannel.Send, handleSend);
    };
  }, []);

  const contextValue = useMemo(
    () => ({ user, setUser, appInfo, getAppInfo }),
    [user, appInfo],
  );

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
