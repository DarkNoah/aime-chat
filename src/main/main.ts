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
import { acpManager } from './app/acp';
import { knowledgeBaseManager } from './knowledge-base';
import { toolsManager } from './tools';
import { localModelManager } from './local-model';
import { agentManager } from './mastra/agents';
import { projectManager } from './project';
import { updateManager } from './app/update';
import { instancesManager } from './instances';
import { taskQueueManager } from './task-queue';
import { marketManager } from './market';
import { channelManager } from './channel';
import { secretsManager } from './app/secrets';
import { cronsManager } from './app/crons';


// process.env.DEFAULT_AGENT = undefined;
// process.env.DEFAULT_MODEL = undefined;
// process.env.DEFAULT_FAST_MODEL = undefined;
// process.env.DEFAULT_VISION_MODEL = undefined;
// process.env.DEFAULT_OCR_MODEL = undefined;
// process.env.DEFAULT_TRANSCRIPTION_MODEL = undefined;
// process.env.DEFAULT_SPEECH_MODEL = undefined;
// process.env.THINK = undefined;

process.env.API_SERVER_ENABLED = 'true'

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


async function init() {
  try {
    await dbManager.init();
    await providersManager.init();
    await appManager.init();
    await mastraManager.init();
    await knowledgeBaseManager.init();
    await toolsManager.init();
    await localModelManager.init();
    await agentManager.init();
    await projectManager.init();
    await updateManager.init();
    await instancesManager.init();
    await taskQueueManager.init();
    await marketManager.init();
    await acpManager.init();
    await channelManager.init();
    await secretsManager.init();
    await cronsManager.init();
  } catch (err) {
    dialog.showErrorBox('Mastra Init Error', String(err));
    app.exit(1);
    throw err;
  }
}

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

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
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
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.exit(0);
} else {
  init();

  app.setAsDefaultProtocolClient('aime-chat');
  app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log('macOS 捕获 URL:', url);
    handleProtocolUrl(url);
  });

  app.on('second-instance', (event, commandLine) => {
    event.preventDefault();
    const protocolUrl = commandLine.find((arg) => arg.startsWith('aime-chat://'));
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
    .then(() => {
      const filter = { urls: ['https://mmbiz.qpic.cn/*'] };

      session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        details.requestHeaders['Referer'] = 'https://mp.weixin.qq.com/';
        // 有时也需 UA 更像微信内置浏览 Chrome
        // details.requestHeaders['User-Agent'] = 'Mozilla/5.0 ...';
        callback({ requestHeaders: details.requestHeaders });
      });
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
