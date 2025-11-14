import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';

export abstract class BaseManager {
  constructor() {
    this.registerIpcChannels();
  }
  abstract init(): Promise<void>;

  registerIpcChannels() {
    if (!ipcMain) return;
    const channels = (this as any)._ipcChannels || [];
    channels.forEach(
      (item: {
        channel: string;
        method: string;
        options: { mode: 'invoke' | 'on' | 'once' };
      }) => {
        if (item.options.mode == 'invoke') {
          ipcMain.handle(item.channel, (event: IpcMainInvokeEvent, ...args) => {
            return this[item.method](...args);
          });
        } else if (item.options.mode == 'on') {
          ipcMain.on(item.channel, (event: IpcMainEvent, ...args) => {
            return this[item.method](event, ...args);
          });
        } else if (item.options.mode == 'once') {
          ipcMain.once(item.channel, (event: IpcMainEvent, ...args) => {
            return this[item.method](event, ...args);
          });
        }
      },
    );
  }
}
