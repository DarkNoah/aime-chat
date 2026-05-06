import { UpdateState } from '@/types/app';
import { AppChannel } from '@/types/ipc-channel';
import { useEffect, useState } from 'react';

const updateEvents = [
  AppChannel.UpdateAvailable,
  AppChannel.UpdateNotAvailable,
  AppChannel.UpdateDownloadProgress,
  AppChannel.UpdateDownloaded,
  AppChannel.UpdateError,
];

export function useUpdateState() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
  });

  useEffect(() => {
    let mounted = true;

    window.electron.app.getUpdateStatus().then((state: UpdateState) => {
      if (mounted) {
        setUpdateState(state);
      }
    });

    const disposers = updateEvents.map((event) =>
      window.electron.ipcRenderer.on(event, (state) => {
        setUpdateState(state as UpdateState);
      }),
    );

    return () => {
      mounted = false;
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  return updateState;
}
