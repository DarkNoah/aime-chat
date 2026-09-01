import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { getAssetPath } from './utils';

export type StartupWindowState = {
  progress: number;
  detail: string;
  failed?: boolean;
};

export type StartupWindowController = {
  window: BrowserWindow;
  ready: Promise<void>;
  update: (state: StartupWindowState) => void;
  close: () => void;
};

const createStartupHtml = (isChinese: boolean, logoDataUrl: string) => {
  const copy = isChinese
    ? {
        title: '正在准备你的工作区',
        hint: '首次启动或版本升级后可能需要更长时间',
        error: '初始化未完成',
      }
    : {
        title: 'Preparing your workspace',
        hint: 'The first launch after an install or update may take longer',
        error: 'Initialization did not finish',
      };

  return `<!doctype html>
<html lang="${isChinese ? 'zh-CN' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <title>AIME Chat</title>
    <style>
      :root {
        color-scheme: light dark;
        --background: #f6f7f9;
        --surface: #ffffff;
        --text: #181b20;
        --muted: #5f6672;
        --track: #e4e7ec;
        --accent: #246bfd;
        --error: #c9362b;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --background: #15171a;
          --surface: #1d2024;
          --text: #f4f5f7;
          --muted: #aeb4bf;
          --track: #343941;
          --accent: #76a3ff;
          --error: #ff8a80;
        }
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: var(--background);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }

      main {
        width: 100%;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 44px 48px 34px;
        background: var(--surface);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 13px;
        margin-bottom: 30px;
      }

      .brand img {
        width: 46px;
        height: 46px;
        border-radius: 12px;
      }

      .brand-name {
        font-size: 17px;
        font-weight: 650;
        letter-spacing: -0.01em;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 22px;
        line-height: 1.25;
        font-weight: 650;
        letter-spacing: -0.02em;
        text-wrap: balance;
      }

      #detail {
        min-height: 22px;
        margin: 0 0 18px;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.55;
      }

      .progress-row {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .progress-track {
        flex: 1;
        height: 6px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--track);
      }

      #progress-bar {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        transition: width 180ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      #progress-text {
        width: 38px;
        color: var(--muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      .hint {
        margin: 24px 0 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.5;
      }

      body.failed h1,
      body.failed #detail,
      body.failed #progress-text {
        color: var(--error);
      }

      body.failed #progress-bar { background: var(--error); }

      @media (prefers-reduced-motion: reduce) {
        #progress-bar { transition: none; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <img src="${logoDataUrl}" alt="" />
        <div class="brand-name">AIME Chat</div>
      </div>
      <h1 id="heading">${copy.title}</h1>
      <p id="detail" aria-live="polite"></p>
      <div class="progress-row">
        <div
          class="progress-track"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
          aria-labelledby="heading"
        >
          <div id="progress-bar"></div>
        </div>
        <span id="progress-text">0%</span>
      </div>
      <p class="hint">${copy.hint}</p>
    </main>
    <script>
      window.__setStartupState = function (state) {
        var progress = Math.max(0, Math.min(100, Math.round(state.progress)));
        document.body.classList.toggle('failed', Boolean(state.failed));
        document.getElementById('heading').textContent = state.failed
          ? ${JSON.stringify(copy.error)}
          : ${JSON.stringify(copy.title)};
        document.getElementById('detail').textContent = state.detail || '';
        document.getElementById('progress-bar').style.width = progress + '%';
        document.getElementById('progress-text').textContent = progress + '%';
        document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(progress));
      };
    </script>
  </body>
</html>`;
};

export const createStartupWindow = (): StartupWindowController => {
  const logo = nativeImage.createFromPath(getAssetPath('icon.png'));
  const logoDataUrl = logo.isEmpty() ? '' : logo.toDataURL();
  const isChinese = app.getLocale().toLowerCase().startsWith('zh');
  const html = createStartupHtml(isChinese, logoDataUrl);
  let loaded = false;
  let latestState: StartupWindowState = {
    progress: 0,
    detail: isChinese ? '正在加载核心模块…' : 'Loading core modules…',
  };

  const startupWindow = new BrowserWindow({
    width: 520,
    height: 340,
    frame: false,
    show: false,
    center: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1d2024' : '#f6f7f9',
    title: 'AIME Chat',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const render = () => {
    if (!loaded || startupWindow.isDestroyed()) return;
    const serializedState = JSON.stringify(latestState);
    startupWindow.webContents
      .executeJavaScript(`window.__setStartupState(${serializedState})`)
      .catch(() => undefined);
  };

  startupWindow.webContents.once('did-finish-load', () => {
    loaded = true;
    render();
  });
  const ready = new Promise<void>((resolve) => {
    startupWindow.once('ready-to-show', () => {
      startupWindow.show();
      resolve();
    });
  });
  startupWindow
    .loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
    .catch(() => undefined);

  return {
    window: startupWindow,
    ready,
    update: (state) => {
      latestState = state;
      render();
    },
    close: () => {
      if (!startupWindow.isDestroyed()) startupWindow.close();
    },
  };
};
