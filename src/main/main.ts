/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog, session } from 'electron';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import mastraManager from './mastra';
import { dbManager } from './db';
import { getAssetPath } from './utils';
import { providersManager } from './providers';
import { appManager } from './app';
import { knowledgeBaseManager } from './knowledge-base';
import { toolsManager } from './tools';
import { localModelManager } from './local-model';
import { agentManager } from './mastra/agents';
import { projectManager } from './project';
import { projectTimelineManager } from './project/timeline';
import { updateManager } from './app/update';
import { instancesManager } from './instances';
import { taskQueueManager } from './task-queue';
import { marketManager } from './market';
import { channelManager } from './channel';
import { secretsManager } from './app/secrets';
import { cronsManager } from './app/crons';
import { initCrashReporter } from './app/crash-reporter';
import { requestLogManager } from './app/request-logs';
import { evalsManager } from './evals';
import { createStartupWindow, StartupWindowController } from './startup-window';

// process.env.DEFAULT_AGENT = undefined;
// process.env.DEFAULT_MODEL = undefined;
// process.env.DEFAULT_FAST_MODEL = undefined;
// process.env.DEFAULT_VISION_MODEL = undefined;
// process.env.DEFAULT_OCR_MODEL = undefined;
// process.env.DEFAULT_TRANSCRIPTION_MODEL = undefined;
// process.env.DEFAULT_SPEECH_MODEL = undefined;
// process.env.THINK = undefined;

// 设置为 "true" 时禁用初始化向导（不再跳转到 /setup 页面），其他任何值均不生效
// process.env.DISABLE_SETUP = "true";

// 品牌定制：值为 assets 目录下的相对路径，越界或不存在时忽略并告警
// process.env.APP_LOGO = "icon.png";
// process.env.SIDEBAR_BACKGROUND = "backgrounds/sidebar.png";
// process.env.CHAT_BACKGROUND = "backgrounds/chat.png";

// 隐藏渲染进程入口，同样只有 "true" 生效
// process.env.DISABLE_PROJECTS = "true";
// process.env.DISABLE_MARKET = "true";
// process.env.DISABLE_CRONS = "true";
// process.env.DISABLE_KNOWLEDGE_BASE = "true";
// process.env.DISABLE_AGENTS = "true";
process.env.DEFAULT_OCR_MODEL = 'rapidocr';
process.env.API_SERVER_ENABLED = 'true';
process.env.TLS_REJECT_UNAUTHORIZED = 'false';
initCrashReporter();

// process.env.DEFAULT_PROVIDER_ID = "openai"
// process.env.DEFAULT_PROVIDER_NAME = "OpenAI"
// process.env.DEFAULT_PROVIDER_TYPE = "openai"
// process.env.DEFAULT_PROVIDER_API_KEY = ""
// process.env.DEFAULT_PROVIDER_API_BASE = ""

// process.env.DEFAULT_PROVIDER_CONFIG = JSON.stringify({
//   [process.env.DEFAULT_PROVIDER_ID]: {
//     "name": process.env.DEFAULT_PROVIDER_NAME,
//     "type": process.env.DEFAULT_PROVIDER_TYPE,
//     "isActive": true,
//     "apiKey": process.env.DEFAULT_PROVIDER_API_KEY,
//     "apiBase": process.env.DEFAULT_PROVIDER_API_BASE,
//   },
// });

type StartupTask = {
  id: string;
  label: string;
  labelEn: string;
  run: () => Promise<void>;
};

const startupTimings = new Map<string, number>();
let startupWindow: StartupWindowController | null = null;
let deferredInitializationStarted = false;

log.info(
  `[startup] main module evaluated after ${Math.round(performance.now())}ms`,
);

const getStartupLabel = (task: StartupTask) =>
  app.getLocale().toLowerCase().startsWith('zh') ? task.label : task.labelEn;

const runStartupTask = async (task: StartupTask) => {
  const startedAt = performance.now();
  try {
    await task.run();
  } finally {
    const duration = Math.round(performance.now() - startedAt);
    startupTimings.set(task.id, duration);
    log.info(`[startup] ${task.id} initialized in ${duration}ms`);
  }
};

const criticalStartupTasks: StartupTask[] = [
  {
    id: 'database',
    label: '正在打开本地数据',
    labelEn: 'Opening local data',
    run: () => dbManager.init(),
  },
  {
    id: 'request-logs',
    label: '正在读取诊断设置',
    labelEn: 'Reading diagnostics settings',
    run: () => requestLogManager.init(),
  },
  {
    id: 'providers',
    label: '正在加载模型服务',
    labelEn: 'Loading model providers',
    run: () => providersManager.init(),
  },
  {
    id: 'app',
    label: '正在应用工作区设置',
    labelEn: 'Applying workspace settings',
    run: () => appManager.init(),
  },
  {
    id: 'mastra',
    label: '正在启动智能体运行时',
    labelEn: 'Starting the agent runtime',
    run: () => mastraManager.init(),
  },
  {
    id: 'task-queue',
    label: '正在准备任务队列',
    labelEn: 'Preparing the task queue',
    run: () => taskQueueManager.init(),
  },
  {
    id: 'knowledge-base',
    label: '正在连接知识库',
    labelEn: 'Connecting the knowledge base',
    run: () => knowledgeBaseManager.init(),
  },
  {
    id: 'tools',
    label: '正在注册工具',
    labelEn: 'Registering tools',
    run: () => toolsManager.init(),
  },
  {
    id: 'agents',
    label: '正在加载内置智能体',
    labelEn: 'Loading built-in agents',
    run: () => agentManager.init(),
  },
  {
    id: 'evals',
    label: '正在准备评测功能',
    labelEn: 'Preparing evaluations',
    run: () => evalsManager.init(),
  },
  {
    id: 'projects',
    label: '正在准备项目空间',
    labelEn: 'Preparing project spaces',
    run: () => projectManager.init(),
  },
  {
    id: 'project-timeline',
    label: '正在准备项目时间线',
    labelEn: 'Preparing project timelines',
    run: () => projectTimelineManager.init(),
  },
  {
    id: 'instances',
    label: '正在检查浏览器实例',
    labelEn: 'Checking browser instances',
    run: () => instancesManager.init(),
  },
  {
    id: 'secrets',
    label: '正在准备密钥存储',
    labelEn: 'Preparing secret storage',
    run: () => secretsManager.init(),
  },
  {
    id: 'channels',
    label: '正在读取消息通道',
    labelEn: 'Reading message channels',
    run: () => channelManager.init(),
  },
  {
    id: 'crons',
    label: '正在恢复定时任务',
    labelEn: 'Restoring scheduled tasks',
    run: () => cronsManager.init(),
  },
];

const deferredStartupTasks: StartupTask[] = [
  {
    id: 'local-models',
    label: '正在检查本地模型',
    labelEn: 'Checking local models',
    run: () => localModelManager.init(),
  },
  {
    id: 'updates',
    label: '正在启动更新服务',
    labelEn: 'Starting the update service',
    run: () => updateManager.init(),
  },
  {
    id: 'market',
    label: '正在同步内置技能',
    labelEn: 'Syncing bundled skills',
    run: () => marketManager.init(),
  },
  {
    id: 'acp-service',
    label: '正在启动 ACP 服务',
    labelEn: 'Starting the ACP service',
    run: () => appManager.startConfiguredServices(),
  },
  {
    id: 'channels-autostart',
    label: '正在连接消息通道',
    labelEn: 'Connecting message channels',
    run: () => channelManager.startConfiguredChannels(),
  },
];

async function init() {
  const startedAt = performance.now();
  try {
    for (const [index, task] of criticalStartupTasks.entries()) {
      startupWindow?.update({
        progress: Math.round((index / criticalStartupTasks.length) * 92),
        detail: getStartupLabel(task),
      });
      // Startup dependencies are intentionally ordered. Each completed task
      // unlocks repositories or runtime state used by the following task.
      // eslint-disable-next-line no-await-in-loop
      await runStartupTask(task);
      startupWindow?.update({
        progress: Math.round(((index + 1) / criticalStartupTasks.length) * 92),
        detail: getStartupLabel(task),
      });
    }
    const duration = Math.round(performance.now() - startedAt);
    log.info(`[startup] critical initialization completed in ${duration}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    startupWindow?.update({ progress: 100, detail: message, failed: true });
    dialog.showErrorBox('AIME Chat Init Error', message);
    app.exit(1);
    throw err;
  }
}

const initDeferredManagers = async () => {
  if (deferredInitializationStarted) return;
  deferredInitializationStarted = true;

  const results = await Promise.allSettled(
    deferredStartupTasks.map((task) => runStartupTask(task)),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.error(
        `[startup] deferred task ${deferredStartupTasks[index].id} failed`,
        result.reason,
      );
    }
  });

  log.info(
    '[startup] initialization timings',
    Object.fromEntries(startupTimings),
  );
};

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const focusMainWindow = () => {
  if (!mainWindow) {
    if (startupWindow && !startupWindow.window.isDestroyed()) {
      startupWindow.window.show();
      startupWindow.window.focus();
    }
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
};

const handleProtocolUrl = (url?: string) => {
  if (!url) {
    return;
  }

  console.log('从网页传来的数据:', url);
  focusMainWindow();
};

const createWindow = async () => {
  if (mainWindow) {
    focusMainWindow();
    return mainWindow;
  }

  if (isDebug) {
    // await installExtensions();
  }

  const initialWindowMode = appManager.getWindowModeState().current;
  const initialWindowSize = appManager.getInitialWindowSize();
  const initialMinimumWidth = appManager.getInitialWindowMinimumWidth();

  mainWindow = new BrowserWindow({
    show: false,
    ...initialWindowSize,
    ...(initialMinimumWidth ? { minWidth: initialMinimumWidth } : {}),
    icon: getAssetPath('icon.png'),
    // frame: false,
    // titleBarStyle: 'hidden',

    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      spellcheck: false,
      //contextIsolation: false,
      contextIsolation: true,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  if (initialWindowMode === 'compact') {
    mainWindow.center();
  }

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
    startupWindow?.close();
    startupWindow = null;
    initDeferredManagers().catch((error) => {
      log.error('[startup] deferred initialization failed', error);
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  return mainWindow;
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.exit(0);
} else {
  let isDisconnectingMcpClients = false;
  let areMcpClientsDisconnected = false;

  app.on('before-quit', (event) => {
    if (areMcpClientsDisconnected) {
      return;
    }

    event.preventDefault();
    if (isDisconnectingMcpClients) {
      return;
    }

    isDisconnectingMcpClients = true;
    void toolsManager.disconnectMcpClients().finally(() => {
      areMcpClientsDisconnected = true;
      app.quit();
    });
  });

  app.setAsDefaultProtocolClient('aime-chat');
  app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('macOS 捕获 URL:', url);
    handleProtocolUrl(url);
  });

  app.on('second-instance', (event, commandLine) => {
    event.preventDefault();
    const protocolUrl = commandLine.find((arg) =>
      arg.startsWith('aime-chat://'),
    );
    handleProtocolUrl(protocolUrl);
    focusMainWindow();
  });

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app
    .whenReady()
    .then(async () => {
      const initialStartupWindow = process.env.START_MINIMIZED
        ? null
        : createStartupWindow();
      startupWindow = initialStartupWindow;
      await initialStartupWindow?.ready;
      await init();
      initialStartupWindow?.update({
        progress: 96,
        detail: app.getLocale().toLowerCase().startsWith('zh')
          ? '正在打开主界面'
          : 'Opening the main window',
      });
      const filter = { urls: ['https://mmbiz.qpic.cn/*'] };

      session.defaultSession.webRequest.onBeforeSendHeaders(
        filter,
        (details, callback) => {
          details.requestHeaders.Referer = 'https://mp.weixin.qq.com/';
          // 有时也需 UA 更像微信内置浏览 Chrome
          // details.requestHeaders['User-Agent'] = 'Mozilla/5.0 ...';
          callback({ requestHeaders: details.requestHeaders });
        },
      );
      createWindow();
      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) {
          createWindow();
          return;
        }

        focusMainWindow();
      });
    })
    .catch(console.log);
}

export const getMainWindow = (): BrowserWindow | null => {
  return mainWindow;
};
