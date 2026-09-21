// Builds the real React preview component and exercises it against native views.
// Run after npm run build: node_modules/.bin/electron .erb/scripts/verify-thread-browser-ui.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const webpack = require('webpack');
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-browser-ui-'));
app.setPath('userData', directory);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
});
const { ThreadBrowserManager } = require('../../src/main/browser/manager.ts');
const manager = new ThreadBrowserManager();
const presentations = [];
const present = manager.present.bind(manager);
manager.present = (input) => {
  presentations.push(input.visible);
  return present(input);
};
const errors = [];
process.on('uncaughtException', (error) => {
  errors.push(error);
  console.error(error);
});

async function build() {
  const entry = path.join(directory, 'preview.tsx');
  fs.writeFileSync(
    entry,
    `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import zh from '${root}/src/i18n/locales/zh-cn.json';
import {ThreadBrowserPreview} from '${root}/src/renderer/components/chat-ui/chat-preview/thread-browser-preview';
import {SidebarProvider, SidebarMenuButton} from '${root}/src/renderer/components/ui/sidebar';
import Instances from '${root}/src/renderer/pages/Settings/instances';
i18n.use(initReactI18next).init({lng:'zh-CN',resources:{'zh-CN':{translation:zh}},interpolation:{escapeValue:false}});
function Fixture(){
 const [thread,setThread]=useState('A'); const [visible,setVisible]=useState(true); const [modal,setModal]=useState(false); const [settings,setSettings]=useState(false); const [collapsed,setCollapsed]=useState(false);
 return <SidebarProvider open={!collapsed}><main style={{height:'100vh',width:'100%',display:'flex',flexDirection:'column',padding:16,gap:12}}>
  <nav style={{display:'flex',gap:16}}><SidebarMenuButton id="nav-tooltip" tooltip="导航提示" style={{width:100}}>导航项</SidebarMenuButton><button id="toggle-nav" onClick={()=>setCollapsed(!collapsed)}>折叠 / 展开导航</button></nav>
  <header style={{display:'flex',alignItems:'center',gap:16}}><strong>聊天浏览器</strong>
   <button id="thread-A" onClick={()=>setThread('A')}>线程 A</button><button id="thread-B" onClick={()=>setThread('B')}>线程 B</button>
   <button id="toggle-preview" onClick={()=>setVisible(!visible)}>显示 / 隐藏预览</button><button id="toggle-modal" onClick={()=>setModal(!modal)}>打开对话框</button>
   <button id="show-settings" onClick={()=>setSettings(!settings)}>实例管理</button>
  </header><div style={{flex:1,minHeight:0}}>{settings ? <Instances/> : <ThreadBrowserPreview key={thread} threadId={thread} active={visible}/>}</div>
  {modal && <div role="dialog" style={{position:'fixed',inset:100,background:'white',border:'1px solid',padding:24,zIndex:10}}><p>原生网页应在对话框打开时隐藏。</p><button id="close-modal" onClick={()=>setModal(false)}>关闭对话框</button></div>}
 </main></SidebarProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
`,
  );
  await new Promise((resolve, reject) => {
    webpack(
      {
        context: root,
        mode: 'development',
        devtool: false,
        target: 'web',
        entry,
        output: { path: directory, filename: 'preview.js' },
        resolve: {
          extensions: ['.tsx', '.ts', '.js', '.json'],
          alias: { '@': path.join(root, 'src') },
          modules: [path.join(root, 'node_modules'), 'node_modules'],
        },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              use: {
                loader: path.join(root, 'node_modules/ts-loader'),
                options: {
                  configFile: path.join(root, 'tsconfig.json'),
                  transpileOnly: true,
                  compilerOptions: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                  },
                },
              },
            },
          ],
        },
        performance: { hints: false },
      },
      (error, stats) => {
        if (error || stats.hasErrors())
          reject(
            error || new Error(stats.toString({ all: false, errors: true })),
          );
        else resolve();
      },
    );
  });
  fs.writeFileSync(
    path.join(directory, 'preload.cjs'),
    `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{instances:{getInstances:()=>ipcRenderer.invoke('instances:getInstances'),setInsecureTls:(id,enabled)=>ipcRenderer.invoke('instances:setInsecureTls',id,enabled),stopInstance:id=>ipcRenderer.invoke('instances:stopInstance',id)},app:{openPath:path=>ipcRenderer.invoke('test:openPath',path)},browser:{state:id=>ipcRenderer.invoke('thread-browser:state',id),action:input=>ipcRenderer.invoke('thread-browser:action',input),present:input=>ipcRenderer.invoke('thread-browser:present',input)},ipcRenderer:{on:(name,fn)=>{const handler=(_e,value)=>fn(value);ipcRenderer.on(name,handler);return ()=>ipcRenderer.removeListener(name,handler)}}});`,
  );
  fs.writeFileSync(
    path.join(directory, 'index.html'),
    `<html><head><meta charset="utf-8"><link rel="stylesheet" href="file://${root}/release/app/dist/renderer/style.css"></head><body><div id="root"></div><script src="./preview.js"></script></body></html>`,
  );
}

app.whenReady().then(async () => {
  let win;
  try {
    await build();
    win = new BrowserWindow({
      width: 1000,
      height: 760,
      show: true,
      webPreferences: {
        preload: path.join(directory, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    manager.setWindow(win);
    let openedPath;
    ipcMain.handle('test:openPath', (_event, value) => {
      openedPath = value;
    });
    const getInstances = () => {
      const overview = manager.overview();
      return [
        {
          id: 'default_browser',
          name: 'Electron Chromium',
          type: 'browser',
          static: true,
          config: {
            engine: 'electron-chromium',
            userDataPath: overview.userDataPath,
            insecureTls: overview.insecureTls,
          },
          status: overview.tabCount ? 'running' : 'stop',
          ...overview,
        },
      ];
    };
    ipcMain.handle('instances:getInstances', getInstances);
    ipcMain.handle('instances:setInsecureTls', (_event, _id, enabled) => {
      manager.setInsecureTls(enabled);
      return getInstances()[0];
    });
    ipcMain.handle('instances:stopInstance', () => manager.closeAllTabs());
    manager.createCdpTab(
      'A',
      'data:text/html;charset=utf-8,<title>搜索页</title><style>body{font:16px system-ui;padding:24px}input{padding:8px}</style><h1>线程 A · 搜索页</h1><label>搜索 <input value="Electron browser"></label>',
    );
    manager.createCdpTab(
      'A',
      'data:text/html;charset=utf-8,<title>详情页</title><style>body{font:16px system-ui;padding:24px}</style><h1>线程 A · 详情页</h1><p>登录状态共享，操作目标独立。</p>',
    );
    manager.createCdpTab(
      'B',
      'data:text/html;charset=utf-8,<title>文档</title><style>body{font:16px system-ui;padding:24px}</style><h1>线程 B · 文档</h1><p>其他线程可继续在后台执行。</p>',
    );
    await win.loadFile(path.join(directory, 'index.html'));
    const wait = async (fn) => {
      for (let i = 0; i < 80; i++) {
        if (await fn()) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('UI condition timed out');
    };
    const click = (expression) =>
      win.webContents.executeJavaScript(`(${expression}).click()`);
    await wait(() => manager.presentation?.threadId === 'A');
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.querySelectorAll("[role=tab]").length',
      ),
      2,
    );
    await click('document.querySelector("[role=tab]")');
    await wait(() => manager.state('A').selectedTabId === 't1');
    assert.equal(manager.state('A').automationTabId, 't1');
    const pageA = manager.registry.get('A', 't1').value.view;
    await wait(() => !pageA.webContents.isLoading());
    await wait(() =>
      win.webContents.executeJavaScript(
        'document.querySelector("input").value.startsWith("data:")',
      ),
    );
    assert.equal(pageA.webContents.getTitle(), '搜索页');
    assert(win.contentView.children.includes(pageA));
    const bounds = manager.presentation.bounds;
    assert.deepEqual(
      pageA.getBounds(),
      Object.fromEntries(
        Object.entries(bounds).map(([key, value]) => [key, Math.round(value)]),
      ),
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.querySelector("button[type=submit]").textContent',
      ),
      '前往',
    );
    fs.writeFileSync(
      path.join(directory, 'thread-a.png'),
      (await win.capturePage()).toPNG(),
    );
    fs.writeFileSync(
      path.join(directory, 'page-a.png'),
      (await pageA.webContents.capturePage()).toPNG(),
    );
    const flushFrames = () =>
      win.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      );
    for (const collapsed of [false, true]) {
      if (collapsed) await click('document.querySelector("#toggle-nav")');
      const point = await win.webContents.executeJavaScript(`(() => {
        const rect = document.querySelector('#nav-tooltip').getBoundingClientRect();
        return {x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2)};
      })()`);
      presentations.length = 0;
      win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
      await wait(() =>
        win.webContents.executeJavaScript(
          '!!document.querySelector("[data-radix-popper-content-wrapper]")',
        ),
      );
      await flushFrames();
      assert.equal(
        await win.webContents.executeJavaScript(
          'document.querySelector("[data-slot=tooltip-content]").getBoundingClientRect().width > 0',
        ),
        collapsed,
      );
      assert(win.contentView.children.includes(pageA));
      assert(
        !presentations.includes(false),
        'Sidebar hover must not hide the native webpage',
      );
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 980, y: 10 });
      await flushFrames();
      // A second movement exits Radix's pointer grace area, as a real mouse does.
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 970, y: 10 });
      await wait(() =>
        win.webContents.executeJavaScript(
          '!document.querySelector("[data-radix-popper-content-wrapper]")',
        ),
      );
      await flushFrames();
      assert(win.contentView.children.includes(pageA));
    }
    await click('document.querySelector("#toggle-modal")');
    await wait(() => !manager.presentation);
    assert(!win.contentView.children.includes(pageA));
    await click('document.querySelector("#close-modal")');
    await wait(() => manager.presentation?.threadId === 'A');
    await click('document.querySelector("#thread-B")');
    await wait(() => manager.presentation?.threadId === 'B');
    assert(
      win.contentView.children.includes(
        manager.registry.get('B', 't1').value.view,
      ),
    );
    assert(!win.contentView.children.includes(pageA));
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.querySelectorAll("[role=tab]").length',
      ),
      1,
    );
    fs.writeFileSync(
      path.join(directory, 'thread-b.png'),
      (await win.capturePage()).toPNG(),
    );
    await click('document.querySelector("#toggle-preview")');
    await wait(() => !manager.presentation);
    assert.equal(manager.state('A').tabs.length, 2);
    assert.equal(manager.state('B').tabs.length, 1);
    await click('document.querySelector("#show-settings")');
    await wait(() =>
      win.webContents.executeJavaScript(
        'document.body.innerText.includes("Electron Chromium")',
      ),
    );
    assert.equal(
      await win.webContents.executeJavaScript(
        'document.querySelectorAll("[role=combobox], input[type=number]").length',
      ),
      0,
    );
    const labels = await win.webContents.executeJavaScript(
      'document.body.innerText',
    );
    assert(labels.includes(manager.overview().userDataPath));
    assert(labels.includes('3 个标签页'));
    await click(
      'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("打开数据目录"))',
    );
    await wait(() => openedPath === manager.overview().userDataPath);
    await click('document.querySelector("#browser-insecure-tls")');
    await wait(() =>
      win.webContents.executeJavaScript(
        'document.querySelector("#browser-insecure-tls").getAttribute("aria-checked") === "true" && document.body.innerText.includes("重启应用后生效")',
      ),
    );
    assert.equal(manager.overview().insecureTls, true);
    await flushFrames();
    await win.webContents.executeJavaScript(
      'Promise.all(document.querySelector("#browser-insecure-tls").getAnimations({subtree:true}).map(animation => animation.finished.catch(() => undefined)))',
    );
    fs.writeFileSync(
      path.join(directory, 'instances-tls.png'),
      (await win.capturePage()).toPNG(),
    );
    await click('document.querySelector("#browser-insecure-tls")');
    await wait(() =>
      win.webContents.executeJavaScript(
        'document.querySelector("#browser-insecure-tls").getAttribute("aria-checked") === "false" && !document.body.innerText.includes("重启应用后生效")',
      ),
    );
    assert.equal(manager.overview().insecureTls, false);
    fs.writeFileSync(
      path.join(directory, 'instances.png'),
      (await win.capturePage()).toPNG(),
    );
    await click(
      'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("关闭所有浏览器标签页"))',
    );
    await wait(() => manager.overview().tabCount === 0);
    await wait(() =>
      win.webContents.executeJavaScript(
        'document.body.innerText.includes("0 个标签页")',
      ),
    );
    assert.equal(errors.length, 0);
    console.log(
      'PASS: real React tab controls, thread switching, native view bounds, expanded/collapsed sidebar hover, modal occlusion, hide without closing.',
    );
    console.log('UI_ARTIFACTS', directory);
    if (process.env.AIME_BROWSER_UI_REVIEW) {
      await click('document.querySelector("#toggle-preview")');
      await click('document.querySelector("#thread-A")');
      console.log('READY_FOR_UI_REVIEW');
      await new Promise((resolve) => setTimeout(resolve, 45000));
    }
    await manager.dispose();
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    await manager.dispose();
    win?.destroy();
    app.exit(1);
  }
});
