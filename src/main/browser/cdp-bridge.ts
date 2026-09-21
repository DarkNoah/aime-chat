/* eslint-disable no-void, no-continue -- CDP responses and events are asynchronous. */
import { createServer, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import type { WebContents } from 'electron';

export interface CdpTab {
  id: string;
  targetId: string;
  webContents: WebContents;
}

export interface CdpHost extends EventEmitter {
  getCdpTab(threadId: string, tabId: string): CdpTab;
  prepareCdpTab(threadId: string, tabId: string): Promise<CdpTab>;
  createCdpTab(threadId: string, url: string): CdpTab;
  closeTab(threadId: string, tabId: string): void;
  configureDownload(threadId: string, tabId: string, params: any): void;
}

interface Grant {
  threadId: string;
  tabId: string;
  token: string;
  clients: Set<WebSocket>;
}

interface AttachedTarget {
  tab: CdpTab;
  nativeSessionId?: string;
}

const sharedBrowserContextId = 'aime-shared-electron';

const cookieMethods = {
  'Storage.getCookies': 'Network.getAllCookies',
  'Storage.setCookies': 'Network.setCookies',
  'Storage.clearCookies': 'Network.clearBrowserCookies',
} as const;

const pageDomains = new Set([
  'Accessibility',
  'Animation',
  'Audits',
  'Autofill',
  'CSS',
  'CacheStorage',
  'DOM',
  'DOMDebugger',
  'DOMSnapshot',
  'DOMStorage',
  'Debugger',
  'Emulation',
  'Fetch',
  'IO',
  'IndexedDB',
  'Input',
  'Inspector',
  'LayerTree',
  'Log',
  'Media',
  'Network',
  'Overlay',
  'Page',
  'Performance',
  'PerformanceTimeline',
  'Profiler',
  'Runtime',
  'Security',
  'Storage',
  'WebAudio',
  'WebAuthn',
]);

/**
 * A browser-shaped CDP transport backed by Electron's per-WebContents debugger.
 * No application-wide debugging port is exposed. Each controller can discover
 * only its bound tab; tabs created by it remain owned by the same chat thread.
 */
export class ElectronCdpBridge {
  private server?: Server;

  private startPromise?: Promise<void>;

  private port?: number;

  private grants = new Map<string, Grant>();

  private sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024 * 1024,
  });

  private debuggerUsers = new Map<number, number>();

  private host: CdpHost;

  constructor(host: CdpHost) {
    this.host = host;
  }

  private async start() {
    if (!this.startPromise) {
      this.startPromise = new Promise<void>((resolve, reject) => {
        this.server = createServer((_req, res) => {
          res.writeHead(404).end();
        });
        this.server.on('upgrade', (req, socket, head) => {
          const grant = this.grants.get(req.url?.slice(1) ?? '');
          if (!grant || req.headers.origin) {
            socket.destroy();
            return;
          }
          try {
            this.host.getCdpTab(grant.threadId, grant.tabId);
          } catch {
            socket.destroy();
            return;
          }
          this.sockets.handleUpgrade(req, socket, head, (ws) =>
            this.connect(ws, grant),
          );
        });
        this.server.once('error', reject);
        this.server.listen(0, '127.0.0.1', () => {
          this.port = (this.server!.address() as { port: number }).port;
          resolve();
        });
      }).catch((error) => {
        this.startPromise = undefined;
        throw error;
      });
    }
    return this.startPromise;
  }

  async endpoint(threadId: string, tabId: string) {
    await this.host.prepareCdpTab(threadId, tabId);
    await this.start();
    let grant = [...this.grants.values()].find(
      (item) => item.threadId === threadId && item.tabId === tabId,
    );
    if (!grant) {
      grant = { threadId, tabId, token: randomUUID(), clients: new Set() };
      this.grants.set(grant.token, grant);
    }
    return `ws://127.0.0.1:${this.port}/${grant.token}`;
  }

  disconnect(threadId: string, tabId?: string) {
    for (const grant of this.grants.values()) {
      if (grant.threadId !== threadId || (tabId && grant.tabId !== tabId))
        continue;
      this.grants.delete(grant.token);
      for (const socket of grant.clients) socket.terminate();
    }
  }

  dispose() {
    for (const grant of this.grants.values())
      for (const socket of grant.clients) socket.terminate();
    this.grants.clear();
    this.sockets.close();
    this.server?.close();
  }

  private connect(socket: WebSocket, grant: Grant) {
    grant.clients.add(socket);
    const targets = new Map<string, CdpTab>();
    const sessions = new Map<string, AttachedTarget>();
    const cleanups: Array<() => void> = [];
    let discover = false;
    let autoAttach = false;
    let closing = false;
    const primary = this.host.getCdpTab(grant.threadId, grant.tabId);
    targets.set(primary.targetId, primary);
    const send = (message: object) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(message));
    };
    const info = (tab: CdpTab) => ({
      targetId: tab.targetId,
      // Playwright requires a context ID even for the default shared session.
      // Ownership is still enforced by this connection's target allowlist.
      browserContextId: sharedBrowserContextId,
      type: 'page',
      title: tab.webContents.getTitle(),
      url: tab.webContents.getURL() || 'about:blank',
      attached: true,
      canAccessOpener: false,
    });
    const target = (id: string): CdpTab => {
      const tab = targets.get(id);
      if (!tab || tab.webContents.isDestroyed())
        throw new Error('Target is closed or outside this browser session.');
      this.host.getCdpTab(grant.threadId, tab.id);
      return tab;
    };
    const attach = (tab: CdpTab) => {
      const existing = [...sessions].find(
        ([, item]) =>
          item.tab.targetId === tab.targetId && !item.nativeSessionId,
      );
      if (existing) return existing[0];
      const sessionId = randomUUID();
      const wc = tab.webContents;
      const debuggerClient = wc.debugger;
      const webContentsId = wc.id;
      if (!debuggerClient.isAttached()) debuggerClient.attach('1.3');
      void debuggerClient
        .sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
        .catch(() => undefined);
      this.debuggerUsers.set(
        webContentsId,
        (this.debuggerUsers.get(webContentsId) ?? 0) + 1,
      );
      sessions.set(sessionId, { tab });
      const onMessage = (
        _event: unknown,
        method: string,
        incomingParams: any,
        nativeSessionId?: string,
      ) => {
        let params = incomingParams;
        // Browser discovery is produced from owned views only, never forwarded.
        if (
          [
            'Target.targetCreated',
            'Target.targetInfoChanged',
            'Target.targetDestroyed',
          ].includes(method)
        )
          return;
        const outgoing = nativeSessionId
          ? [...sessions].find(
              ([, item]) =>
                item.tab === tab && item.nativeSessionId === nativeSessionId,
            )?.[0]
          : sessionId;
        if (!outgoing) return;
        if (method === 'Target.attachedToTarget') {
          if (['page', 'webview', 'browser'].includes(params.targetInfo?.type))
            return;
          const childId = randomUUID();
          sessions.set(childId, { tab, nativeSessionId: params.sessionId });
          params = { ...params, sessionId: childId };
        } else if (method === 'Target.detachedFromTarget') {
          const child = [...sessions].find(
            ([, item]) =>
              item.tab === tab && item.nativeSessionId === params.sessionId,
          );
          if (!child) return;
          sessions.delete(child[0]);
          params = { ...params, sessionId: child[0] };
        }
        send({ method, params, sessionId: outgoing });
      };
      const changed = () => {
        if (discover && !wc.isDestroyed())
          send({
            method: 'Target.targetInfoChanged',
            params: { targetInfo: info(tab) },
          });
      };
      const destroyed = () => {
        send({
          method: 'Target.detachedFromTarget',
          params: { sessionId, targetId: tab.targetId },
        });
        send({
          method: 'Target.targetDestroyed',
          params: { targetId: tab.targetId },
        });
        if (tab === primary) socket.close();
      };
      const detached = () => {
        if (!closing) socket.close();
      };
      debuggerClient.on('message', onMessage);
      debuggerClient.on('detach', detached);
      wc.on('did-navigate', changed);
      wc.on('page-title-updated', changed);
      wc.once('destroyed', destroyed);
      cleanups.push(() => {
        debuggerClient.removeListener('message', onMessage);
        debuggerClient.removeListener('detach', detached);
        wc.removeListener('did-navigate', changed);
        wc.removeListener('page-title-updated', changed);
        wc.removeListener('destroyed', destroyed);
        const remaining = (this.debuggerUsers.get(webContentsId) ?? 1) - 1;
        if (remaining > 0) this.debuggerUsers.set(webContentsId, remaining);
        else {
          this.debuggerUsers.delete(webContentsId);
          if (!wc.isDestroyed() && debuggerClient.isAttached())
            debuggerClient.detach();
        }
      });
      return sessionId;
    };
    const emitAttached = (tab: CdpTab) => {
      const sessionId = attach(tab);
      send({
        method: 'Target.attachedToTarget',
        params: { sessionId, targetInfo: info(tab), waitingForDebugger: false },
      });
    };
    const onDownload = (event: {
      threadId: string;
      tabId: string;
      method: string;
      params: any;
    }) => {
      if (
        event.threadId !== grant.threadId ||
        ![...targets.values()].some((tab) => tab.id === event.tabId)
      )
        return;
      send({ method: event.method, params: event.params });
    };
    this.host.on('download', onDownload);
    cleanups.push(() => this.host.off('download', onDownload));

    const dispatch = async (message: any): Promise<any> => {
      const { method, sessionId } = message;
      const params = message.params ?? {};
      // Check the primary target on every command, including browser-level calls.
      target(primary.targetId);
      const attached = sessionId ? sessions.get(sessionId) : undefined;
      if (sessionId && !attached)
        throw new Error('Unknown or foreign debugging session.');
      if (method === 'Target.getTargets')
        return { targetInfos: [...targets.values()].map(info) };
      if (method === 'Target.getBrowserContexts')
        return { browserContextIds: [] };
      if (method === 'Target.getTargetInfo')
        return {
          targetInfo: info(
            params.targetId
              ? target(params.targetId)
              : (attached?.tab ?? primary),
          ),
        };
      if (method === 'Target.setDiscoverTargets') {
        discover = params.discover;
        if (discover)
          for (const tab of targets.values())
            send({
              method: 'Target.targetCreated',
              params: { targetInfo: info(tab) },
            });
        return {};
      }
      if (method === 'Target.setAutoAttach' && !attached) {
        autoAttach = params.autoAttach;
        if (autoAttach) for (const tab of targets.values()) emitAttached(tab);
        return {};
      }
      if (method === 'Target.attachToTarget')
        return { sessionId: attach(target(params.targetId)) };
      if (method === 'Target.createTarget') {
        const created = this.host.createCdpTab(
          grant.threadId,
          params.url || 'about:blank',
        );
        const tab = await this.host.prepareCdpTab(grant.threadId, created.id);
        targets.set(tab.targetId, tab);
        this.host.emit('controller-created-tab', {
          threadId: grant.threadId,
          sourceTabId: grant.tabId,
          tabId: tab.id,
        });
        if (discover)
          send({
            method: 'Target.targetCreated',
            params: { targetInfo: info(tab) },
          });
        if (autoAttach) emitAttached(tab);
        return { targetId: tab.targetId };
      }
      if (method === 'Target.closeTarget') {
        this.host.closeTab(grant.threadId, target(params.targetId).id);
        return { success: true };
      }
      if (method === 'Target.activateTarget') {
        target(params.targetId);
        return {};
      }
      if (method === 'Page.bringToFront') return {}; // Viewing never steals another thread's preview.
      if (method === 'Target.detachFromTarget') {
        if (!sessions.has(params.sessionId))
          throw new Error('Unknown debugging session.');
        sessions.delete(params.sessionId);
        return {};
      }
      const tab = attached?.tab ?? primary;
      const wc = target(tab.targetId).webContents;
      if (Object.hasOwn(cookieMethods, method)) {
        if (
          params.browserContextId !== undefined &&
          params.browserContextId !== sharedBrowserContextId
        )
          throw new Error('Unknown or foreign browser context.');
        if (!attached) attach(tab);
        // Storage commands target Electron's default session, whose context
        // registry cannot resolve our session.fromPath profile. The page's
        // Network commands use its actual storage partition instead.
        return wc.debugger.sendCommand(
          cookieMethods[method as keyof typeof cookieMethods],
          method === 'Storage.setCookies' ? { cookies: params.cookies } : {},
        );
      }
      if (method === 'Browser.getVersion')
        return {
          protocolVersion: '1.3',
          product: `Chrome/${process.versions.chrome}`,
          revision: '',
          userAgent: wc.getUserAgent(),
          jsVersion: process.versions.v8,
        };
      if (
        method === 'Browser.setDownloadBehavior' ||
        method === 'Page.setDownloadBehavior'
      ) {
        this.host.configureDownload(grant.threadId, tab.id, params);
        return {};
      }
      if (method === 'Browser.getWindowForTarget') {
        if (params.targetId) target(params.targetId);
        return {
          windowId: wc.id,
          bounds: {
            left: 0,
            top: 0,
            width: 1280,
            height: 800,
            windowState: 'normal',
          },
        };
      }
      if (
        method.startsWith('Browser.') ||
        (method.startsWith('Target.') && method !== 'Target.setAutoAttach')
      ) {
        throw new Error(
          `${method} is not available on a thread-owned Electron tab.`,
        );
      }
      if (
        !pageDomains.has(method.split('.')[0]) &&
        method !== 'Target.setAutoAttach'
      )
        throw new Error(`Unsupported CDP method: ${method}`);
      if (!attached) attach(tab);
      return wc.debugger.sendCommand(method, params, attached?.nativeSessionId);
    };
    socket.on('message', (raw) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.close(1003);
        return;
      }
      if (!Number.isInteger(message.id) || typeof message.method !== 'string')
        return;
      void dispatch(message).then(
        (result) =>
          send({
            id: message.id,
            result: result ?? {},
            ...(message.sessionId ? { sessionId: message.sessionId } : {}),
          }),
        (error) =>
          send({
            id: message.id,
            error: { code: -32000, message: error.message },
            ...(message.sessionId ? { sessionId: message.sessionId } : {}),
          }),
      );
    });
    socket.on('error', () => socket.close());
    socket.once('close', () => {
      closing = true;
      grant.clients.delete(socket);
      for (const cleanup of cleanups) cleanup();
    });
  }
}
