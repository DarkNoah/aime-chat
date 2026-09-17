/* eslint-disable no-void, no-continue -- Native lifecycle notifications are fire-and-forget. */
import {
  app,
  BaseWindow,
  BrowserWindow,
  ipcMain,
  session,
  WebContentsView,
} from 'electron';
import type {
  WebContents,
  DownloadItem,
  Event as ElectronEvent,
  Session,
  ProxyConfig,
  WebPreferences,
} from 'electron';
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ThreadBrowserChannel } from '../../types/thread-browser';
import type {
  BrowserPresentation,
  ThreadBrowserAction,
  ThreadBrowserState,
} from '../../types/thread-browser';
import { BrowserRegistry } from './registry';
import { ElectronCdpBridge, CdpTab } from './cdp-bridge';
import { normalizeBrowserUrl } from './command';
import { runBrowserCli } from './cli';
import { readBrowserPage } from './read-page';
import { browserProfilePath, migrateBrowserProfile } from './profile';

interface TabRuntime {
  view: WebContentsView;
  error?: string;
  controllerVersion: number;
  controllerDirty: boolean;
  download?: { behavior: string; downloadPath?: string };
  abort: AbortController;
  controller?: { session: string; configPath: string };
  transient?: boolean;
}

export class ThreadBrowserManager extends EventEmitter {
  readonly registry = new BrowserRegistry<TabRuntime>();

  readonly bridge = new ElectronCdpBridge(this);

  private window?: BrowserWindow;

  private registered = false;

  private browserSession?: Session;

  private backgroundWindow?: BaseWindow;

  private presentation?: BrowserPresentation;

  private attachedView?: WebContentsView;

  private busyThreads = new Set<string>();

  private runningTabs = new Map<string, string>();

  private disposed = false;

  private deletedThreads = new Set<string>();

  private configPath?: string;

  private startupId = randomUUID();

  private controllerCleanup = new Set<Promise<unknown>>();

  private proxy?: ProxyConfig;

  private proxyReady = Promise.resolve();

  private profileReady = false;

  private generation = 0;

  constructor() {
    super();
    this.on('controller-created-tab', ({ threadId, sourceTabId, tabId }) => {
      this.registry.get(threadId, sourceTabId).value.controllerDirty = true;
      this.registry.select(threadId, tabId, true);
      this.changed(threadId);
    });
  }

  setWindow(window?: BrowserWindow) {
    this.hideView();
    this.window = window;
    this.presentation = undefined;
    window?.once('close', () => {
      if (this.window === window) {
        this.hideView();
        this.presentation = undefined;
      }
    });
    if (window && !this.registered) {
      const handle = (channel: string, action: (...args: any[]) => any) => {
        ipcMain.handle(channel, (event, ...args) => {
          if (!this.window || this.window.isDestroyed()) {
            if (channel === ThreadBrowserChannel.Present) return undefined;
            throw new Error('The application window is closed.');
          }
          if (event.sender !== this.window.webContents)
            throw new Error(
              'Browser controls are only available to the application window.',
            );
          return action(...args);
        });
      };
      handle(ThreadBrowserChannel.State, (threadId: string) =>
        this.state(threadId),
      );
      handle(ThreadBrowserChannel.Action, (input: ThreadBrowserAction) =>
        this.action(input),
      );
      handle(ThreadBrowserChannel.Present, (input: BrowserPresentation) =>
        this.present(input),
      );
      this.registered = true;
    }
  }

  private assertThread(threadId: string) {
    if (this.disposed) throw new Error('The browser is shutting down.');
    if (this.deletedThreads.has(threadId))
      throw new Error('This chat thread was deleted.');
    return this.registry.thread(threadId);
  }

  private getSession() {
    if (!this.browserSession) {
      // One persistent session for ALL browser tabs, regardless of chat/project.
      this.browserSession = session.fromPath(this.prepareProfile());
      if (this.proxy)
        this.proxyReady = this.browserSession.setProxy(this.proxy);
      this.browserSession.on('will-download', (event, item, wc) =>
        this.download(event, item, wc),
      );
    }
    return this.browserSession;
  }

  prepareProfile() {
    const root = app.getPath('userData');
    if (!this.profileReady) {
      migrateBrowserProfile(root);
      this.profileReady = true;
    }
    return browserProfilePath(root);
  }

  overview() {
    const threads = [...this.registry.threads.values()];
    return {
      userDataPath: this.prepareProfile(),
      tabCount: threads.reduce(
        (sum, thread) =>
          sum +
          [...thread.tabs.values()].filter((tab) => !tab.value.transient)
            .length,
        0,
      ),
      threadCount: threads.filter((thread) =>
        [...thread.tabs.values()].some((tab) => !tab.value.transient),
      ).length,
      chromiumVersion: process.versions.chrome,
    };
  }

  closeAllTabs() {
    this.generation += 1;
    for (const [threadId, thread] of this.registry.threads) {
      this.closeThread(threadId);
      thread.automationTabId = undefined;
    }
  }

  state(threadId: string): ThreadBrowserState {
    const thread = this.assertThread(threadId);
    return {
      threadId,
      selectedTabId: thread.selectedTabId,
      automationTabId: thread.automationTabId,
      runningTabId: this.runningTabs.get(threadId),
      busy: this.busyThreads.has(threadId),
      tabs: [...thread.tabs.values()]
        .filter(
          (tab) =>
            !tab.value.transient && !tab.value.view.webContents.isDestroyed(),
        )
        .map((tab) => {
          const wc = tab.value.view.webContents;
          return {
            id: tab.id,
            title: wc.getTitle(),
            url: wc.getURL() || 'about:blank',
            loading: wc.isLoading(),
            canGoBack: wc.navigationHistory.canGoBack(),
            canGoForward: wc.navigationHistory.canGoForward(),
            error: tab.value.error,
          };
        }),
    };
  }

  private changed(threadId: string) {
    if (this.disposed || this.deletedThreads.has(threadId)) return;
    this.render();
    const state = this.state(threadId);
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send(ThreadBrowserChannel.Changed, state);
    this.emit('changed', state);
  }

  requestPreview(threadId: string) {
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send(ThreadBrowserChannel.Requested, {
        threadId,
      });
  }

  private makeTab(
    threadId: string,
    options?: {
      webContents?: WebContents;
      webPreferences?: WebPreferences;
      transient?: boolean;
    },
  ) {
    this.assertThread(threadId);
    if (!this.backgroundWindow)
      this.backgroundWindow = new BaseWindow({
        show: false,
        width: 1280,
        height: 800,
      });
    const view = new WebContentsView({
      ...(options?.webContents ? { webContents: options.webContents } : {}),
      webPreferences: {
        ...options?.webPreferences,
        session: this.getSession(),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: undefined,
        backgroundThrottling: false,
      },
    });
    view.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
    this.backgroundWindow.contentView.addChildView(view);
    const thread = this.registry.thread(threadId);
    const { selectedTabId, automationTabId } = thread;
    const tab = this.registry.add(threadId, randomUUID(), {
      view,
      transient: options?.transient,
      controllerVersion: 0,
      controllerDirty: false,
      abort: new AbortController(),
    });
    if (options?.transient) {
      thread.selectedTabId = selectedTabId;
      thread.automationTabId = automationTabId;
    }
    const wc = view.webContents;
    const refresh = () => this.changed(threadId);
    wc.on('did-start-loading', () => {
      tab.value.error = undefined;
      refresh();
    });
    wc.on('did-stop-loading', refresh);
    wc.on('did-navigate', refresh);
    wc.on('did-navigate-in-page', refresh);
    wc.on('page-title-updated', refresh);
    wc.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        tab.value.error = description;
        refresh();
      }
    });
    wc.on('render-process-gone', (_event, details) => {
      tab.value.error = `Page process exited: ${details.reason}`;
      this.resetController(threadId, tab.id);
      refresh();
    });
    wc.once('destroyed', () => {
      this.releaseController(tab.value);
      tab.value.abort.abort();
      this.bridge.disconnect(threadId, tab.id);
      if (this.attachedView === view) this.hideView();
      if (this.backgroundWindow?.contentView.children.includes(view))
        this.backgroundWindow.contentView.removeChildView(view);
      if (this.registry.threads.get(threadId)?.tabs.has(tab.id))
        this.registry.remove(threadId, tab.id);
      refresh();
    });
    wc.setWindowOpenHandler(() =>
      options?.transient
        ? { action: 'deny' }
        : {
            action: 'allow',
            outlivesOpener: true,
            createWindow: (windowOptions) =>
              this.makeTab(threadId, windowOptions).value.view.webContents,
          },
    );
    this.changed(threadId);
    return tab;
  }

  createCdpTab(threadId: string, url: string): CdpTab {
    const normalized = normalizeBrowserUrl(url);
    const tab = this.makeTab(threadId);
    void this.proxyReady
      .then(() => {
        this.assertThread(threadId);
        return tab.value.view.webContents.loadURL(normalized);
      })
      .catch((error) => {
        if (!tab.value.view.webContents.isDestroyed()) {
          tab.value.error = error.message;
          this.changed(threadId);
        }
      });
    return this.getCdpTab(threadId, tab.id);
  }

  getCdpTab(threadId: string, tabId: string): CdpTab {
    this.assertThread(threadId);
    const tab = this.registry.get(threadId, tabId);
    if (tab.value.view.webContents.isDestroyed())
      throw new Error('Browser tab is closed.');
    return {
      id: tab.id,
      targetId: tab.targetId,
      webContents: tab.value.view.webContents,
    };
  }

  ensureAutomationTab(threadId: string, tabId?: string) {
    const thread = this.assertThread(threadId);
    if (!tabId && !thread.automationTabId && !thread.tabs.size)
      this.createCdpTab(threadId, 'about:blank');
    return this.registry.get(threadId, tabId);
  }

  resetController(threadId: string, tabId: string) {
    const tab = this.registry.get(threadId, tabId);
    this.releaseController(tab.value);
    tab.value.abort.abort();
    tab.value.abort = new AbortController();
    tab.value.controllerVersion += 1;
    tab.value.controllerDirty = false;
    this.bridge.disconnect(threadId, tabId);
  }

  async controller(threadId: string, tabId: string) {
    await this.proxyReady;
    this.assertThread(threadId);
    const tab = this.registry.get(threadId, tabId);
    if (tab.value.controllerDirty) this.resetController(threadId, tabId);
    const endpoint = await this.bridge.endpoint(threadId, tabId);
    if (!this.configPath) {
      const directory = path.join(app.getPath('userData'), 'browser-control');
      await fs.mkdir(directory, { recursive: true });
      this.configPath = path.join(directory, 'agent-browser.json');
      // Explicit config prevents an unrelated global or workspace CDP setting.
      await fs.writeFile(this.configPath, '{}\n', { mode: 0o600 });
    }
    const id = createHash('sha256')
      .update(
        `${this.startupId}:${threadId}:${tabId}:${tab.value.controllerVersion}`,
      )
      .digest('hex')
      .slice(0, 24);
    tab.value.controller = {
      session: `aime-${id}`,
      configPath: this.configPath,
    };
    return {
      endpoint,
      ...tab.value.controller,
      abortSignal: tab.value.abort.signal,
    };
  }

  private releaseController(runtime: TabRuntime) {
    const { controller } = runtime;
    runtime.controller = undefined;
    if (!controller) return;
    const cleanup = runBrowserCli(
      [
        '--session',
        controller.session,
        '--config',
        controller.configPath,
        'close',
      ],
      { timeout: 3000 },
    ).catch(() => undefined);
    this.controllerCleanup.add(cleanup);
    void cleanup.finally(() => this.controllerCleanup.delete(cleanup));
  }

  async setProxy(proxy: ProxyConfig) {
    this.proxy = proxy;
    this.proxyReady = this.browserSession?.setProxy(proxy) ?? Promise.resolve();
    await this.proxyReady;
  }

  setRunningTab(threadId: string, tabId: string) {
    this.getCdpTab(threadId, tabId);
    this.runningTabs.set(threadId, tabId);
    this.changed(threadId);
  }

  async run<R>(
    threadId: string,
    action: () => Promise<R>,
    signal?: AbortSignal,
  ): Promise<R> {
    const { generation } = this;
    return this.registry.run(
      threadId,
      async () => {
        this.assertThread(threadId);
        if (generation !== this.generation)
          throw new Error('Browser action cancelled by closing all tabs.');
        this.busyThreads.add(threadId);
        this.changed(threadId);
        try {
          return await action();
        } finally {
          this.busyThreads.delete(threadId);
          this.runningTabs.delete(threadId);
          this.changed(threadId);
        }
      },
      signal,
    );
  }

  /** WebFetch uses a temporary owned page in the same Session without switching tabs. */
  async readPage(
    threadId: string | undefined,
    url: string,
    signal?: AbortSignal,
  ) {
    const owner = threadId || `web-fetch:${randomUUID()}`;
    try {
      return await this.run(
        owner,
        async () => {
          const tab = this.makeTab(owner, { transient: true });
          const wc = tab.value.view.webContents;
          const cancelled = AbortSignal.any([
            tab.value.abort.signal,
            ...(signal ? [signal] : []),
          ]);
          try {
            await this.proxyReady;
            if (cancelled.aborted) throw new Error('Web fetch cancelled.');
            return await readBrowserPage(
              wc,
              normalizeBrowserUrl(url),
              cancelled,
            );
          } finally {
            if (this.registry.threads.get(owner)?.tabs.has(tab.id))
              this.closeTab(owner, tab.id);
          }
        },
        signal,
      );
    } finally {
      if (!threadId) this.registry.threads.delete(owner);
    }
  }

  closeTab(threadId: string, tabId: string) {
    const tab = this.registry.get(threadId, tabId);
    this.releaseController(tab.value);
    this.bridge.disconnect(threadId, tabId);
    tab.value.abort.abort();
    this.registry.remove(threadId, tabId);
    if (this.attachedView === tab.value.view) this.hideView();
    if (this.backgroundWindow?.contentView.children.includes(tab.value.view))
      this.backgroundWindow.contentView.removeChildView(tab.value.view);
    tab.value.view.webContents.close({ waitForBeforeUnload: false });
    this.changed(threadId);
  }

  closeThread(threadId: string, deleted = false) {
    const thread = this.registry.threads.get(threadId);
    if (thread)
      for (const id of [...thread.tabs.keys()]) this.closeTab(threadId, id);
    this.bridge.disconnect(threadId);
    if (deleted) {
      this.deletedThreads.add(threadId);
      this.registry.threads.delete(threadId);
    }
  }

  async action(input: ThreadBrowserAction) {
    const thread = this.assertThread(input.threadId);
    if (input.action === 'select') {
      this.registry.select(input.threadId, input.tabId!); // Presentation only.
      this.changed(input.threadId);
    } else if (input.action === 'close')
      this.closeTab(input.threadId, input.tabId!);
    else if (input.action === 'stop') {
      const id = input.tabId ?? thread.selectedTabId;
      this.resetController(input.threadId, id!);
      this.getCdpTab(input.threadId, id!).webContents.stop();
      this.changed(input.threadId);
    } else
      await this.run(input.threadId, async () => {
        if (input.action === 'new')
          this.createCdpTab(input.threadId, input.url || 'about:blank');
        else {
          const wc = this.getCdpTab(
            input.threadId,
            input.tabId ?? thread.selectedTabId!,
          ).webContents;
          if (input.action === 'navigate')
            await this.proxyReady.then(() =>
              wc.loadURL(normalizeBrowserUrl(input.url ?? '')),
            );
          else if (input.action === 'back' && wc.navigationHistory.canGoBack())
            wc.navigationHistory.goBack();
          else if (
            input.action === 'forward' &&
            wc.navigationHistory.canGoForward()
          )
            wc.navigationHistory.goForward();
          else if (input.action === 'reload') wc.reload();
        }
      });
    return this.state(input.threadId);
  }

  present(input: BrowserPresentation) {
    if (!input.visible) {
      if (
        this.presentation?.ownerId === input.ownerId &&
        this.presentation.threadId === input.threadId
      ) {
        this.presentation = undefined;
        this.hideView();
      }
      return;
    }
    this.assertThread(input.threadId);
    if (
      !input.bounds ||
      Object.values(input.bounds).some((value) => !Number.isFinite(value))
    )
      throw new Error('Invalid browser bounds.');
    this.presentation = input;
    this.render();
  }

  private hideView() {
    if (this.attachedView && this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.attachedView);
      if (!this.attachedView.webContents.isDestroyed())
        this.backgroundWindow?.contentView.addChildView(this.attachedView);
    }
    this.attachedView = undefined;
  }

  private render() {
    const { presentation } = this;
    if (!presentation || !this.window || this.window.isDestroyed()) return;
    const thread = this.registry.threads.get(presentation.threadId);
    const tab = thread?.selectedTabId
      ? thread.tabs.get(thread.selectedTabId)
      : undefined;
    if (
      !tab ||
      tab.value.view.webContents.isDestroyed() ||
      !presentation.bounds
    ) {
      this.hideView();
      return;
    }
    const { view } = tab.value;
    if (this.attachedView !== view) {
      this.hideView();
      this.backgroundWindow?.contentView.removeChildView(view);
      this.window.contentView.addChildView(view);
      this.attachedView = view;
    }
    const zoom = this.window.webContents.getZoomFactor();
    const { x, y, width, height } = presentation.bounds;
    view.setBounds({
      x: Math.round(x * zoom),
      y: Math.round(y * zoom),
      width: Math.max(1, Math.round(width * zoom)),
      height: Math.max(1, Math.round(height * zoom)),
    });
  }

  configureDownload(threadId: string, tabId: string, params: any) {
    this.registry.get(threadId, tabId).value.download = params;
  }

  private download(event: ElectronEvent, item: DownloadItem, wc: WebContents) {
    for (const [threadId, thread] of this.registry.threads) {
      const tab = [...thread.tabs.values()].find(
        (entry) => entry.value.view.webContents === wc,
      );
      if (!tab) continue;
      const config = tab.value.download;
      if (config?.behavior === 'deny') {
        event.preventDefault();
        return;
      }
      const guid = randomUUID();
      if (config?.downloadPath)
        item.setSavePath(
          path.join(
            config.downloadPath,
            config.behavior === 'allowAndName'
              ? guid
              : path.basename(item.getFilename()),
          ),
        );
      const emit = (method: string, params: object) =>
        this.emit('download', { threadId, tabId: tab.id, method, params });
      emit('Browser.downloadWillBegin', {
        guid,
        url: item.getURL(),
        suggestedFilename: item.getFilename(),
        frameId: '',
      });
      const progress = (state: string) =>
        emit('Browser.downloadProgress', {
          guid,
          state,
          totalBytes: item.getTotalBytes(),
          receivedBytes: item.getReceivedBytes(),
          filePath: item.getSavePath(),
        });
      item.on('updated', () => progress('inProgress'));
      item.once('done', (_e, state) =>
        progress(state === 'completed' ? 'completed' : 'canceled'),
      );
      return;
    }
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.setWindow(undefined);
    for (const threadId of this.registry.threads.keys())
      this.closeThread(threadId);
    this.hideView();
    this.bridge.dispose();
    this.backgroundWindow?.close();
    this.backgroundWindow = undefined;
    await Promise.allSettled([...this.controllerCleanup]);
  }
}

export const threadBrowserManager = new ThreadBrowserManager();
