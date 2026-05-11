import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import type { Application, NextFunction, Request, Response } from 'express';
import type { ApiRouteMetadata } from './api/ApiController';

export abstract class BaseManager {
  private static managerInstances: BaseManager[] = [];
  private static apiRouteApps = new WeakSet<Application>();

  constructor() {
    BaseManager.managerInstances.push(this);
    this.registerIpcChannels();
  }
  abstract init(): Promise<void>;

  static registerApiRoutes(app: Application) {
    if (BaseManager.apiRouteApps.has(app)) return;

    const registeredRoutes = new Set<string>();
    for (const instance of BaseManager.managerInstances) {
      const routes = ((instance as any)._apiRoutes || []) as ApiRouteMetadata[];

      for (const route of routes) {
        const method = route.method.toLowerCase() as ApiRouteMetadata['method'];
        const routeKey = `${method.toUpperCase()} ${route.path}`;
        if (registeredRoutes.has(routeKey)) {
          throw new Error(`Duplicate API route: ${routeKey}`);
        }
        registeredRoutes.add(routeKey);

        app[method](
          route.path,
          async (req: Request, res: Response, next: NextFunction) => {
            try {
              if (route.raw) {
                await instance[route.handler](req, res, next);
                return;
              }

              const args = route.args ? route.args(req) : [req.body];
              const result = await instance[route.handler](...args);
              if (!res.headersSent) {
                res.json(result ?? null);
              }
            } catch (error) {
              next(error);
            }
          },
        );
      }
    }

    BaseManager.apiRouteApps.add(app);
  }

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
