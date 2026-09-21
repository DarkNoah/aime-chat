// Isolated Electron smoke: real filesystem UI, editors, IPC and temporary files.
// Run: node .erb/scripts/verify-filesystem-ui.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const webpack = require('webpack');
const { _electron: electron } = require('playwright');
process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exitCode = 1;
});
const root = path.resolve(__dirname, '../..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-filesystem-ui-'));
const workspace = path.join(directory, 'workspace');
fs.mkdirSync(workspace);
fs.writeFileSync(path.join(workspace, 'a.txt'), 'original a');
fs.writeFileSync(path.join(workspace, 'b.txt'), 'original b');
fs.writeFileSync(
  path.join(directory, 'entry.tsx'),
  `
import React from 'react';
import {createRoot} from 'react-dom/client';
import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import zh from '${root}/src/i18n/locales/zh-cn.json';
import {ChatFilesystem} from '${root}/src/renderer/components/chat-ui/chat-filesystem';
i18n.use(initReactI18next).init({lng:'zh-CN', resources:{'zh-CN':{translation:zh}}, interpolation:{escapeValue:false}});
createRoot(document.getElementById('root')).render(<div style={{height:'100vh'}}><ChatFilesystem workspace={${JSON.stringify(workspace)}} /></div>);
`,
);
fs.writeFileSync(
  path.join(directory, 'preload.cjs'),
  `
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('electron',{app:Object.fromEntries(['getDirectoryTree','getDirectoryChildren','readFileContent','writeFileContent','mutateWorkspaceEntry','toast','openPath'].map(name=>[name,(...args)=>ipcRenderer.invoke(name,...args)])),projects:{openWith:()=>{} }});
`,
);
fs.writeFileSync(
  path.join(directory, 'main.cjs'),
  `
const {app,BrowserWindow,ipcMain,shell}=require('electron');
const fs=require('node:fs'); const path=require('node:path');
app.setPath('userData',${JSON.stringify(path.join(directory, 'profile'))});
require(${JSON.stringify(require.resolve('ts-node'))}).register({transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const {mutateWorkspaceEntry}=require(${JSON.stringify(path.join(root, 'src/main/utils/workspace-entry.ts'))});
const {writeWorkspaceTextFile}=require(${JSON.stringify(path.join(root, 'src/main/utils/workspace-file.ts'))});
const children=p=>fs.readdirSync(p,{withFileTypes:true}).map(e=>({name:e.name,path:path.join(p,e.name),isDirectory:e.isDirectory(),...(e.isDirectory()?{children:[]}: {})}));
ipcMain.handle('getDirectoryTree',(_,p)=>({path:p,name:path.basename(p),isDirectory:true,children:children(p)}));
ipcMain.handle('getDirectoryChildren',(_,p)=>children(p));
ipcMain.handle('readFileContent',(_,p)=>({content:fs.readFileSync(p,'utf8'),size:fs.statSync(p).size,isBinary:false,truncated:false,mimeType:'text/plain'}));
ipcMain.handle('writeFileContent',(_,p,c,w)=>writeWorkspaceTextFile(w,p,c));
ipcMain.handle('mutateWorkspaceEntry',(_,op)=>mutateWorkspaceEntry(op,p=>shell.trashItem(p)));
ipcMain.handle('toast',()=>{});ipcMain.handle('openPath',()=>{});
app.whenReady().then(()=>{const win=new BrowserWindow({width:1200,height:760,webPreferences:{preload:${JSON.stringify(path.join(directory, 'preload.cjs'))}}});win.loadFile(${JSON.stringify(path.join(directory, 'index.html'))});});
`,
);
fs.writeFileSync(
  path.join(directory, 'index.html'),
  `<html><head><meta charset="UTF-8"><link rel="stylesheet" href="file://${root}/release/app/dist/renderer/style.css"></head><body><div id="root"></div><script src="./entry.js"></script></body></html>`,
);
async function run() {
  await new Promise((resolve, reject) =>
    webpack(
      {
        context: root,
        mode: 'production',
        optimization: { minimize: false },
        devtool: false,
        target: 'web',
        entry: path.join(directory, 'entry.tsx'),
        output: { path: directory, filename: 'entry.js' },
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
                loader: require.resolve('ts-loader'),
                options: {
                  transpileOnly: true,
                  configFile: path.join(root, 'tsconfig.json'),
                  compilerOptions: {
                    module: 'esnext',
                    moduleResolution: 'bundler',
                  },
                },
              },
            },
            {
              test: /\.css$/,
              use: [
                require.resolve('style-loader'),
                require.resolve('css-loader'),
              ],
            },
          ],
        },
        performance: { hints: false },
      },
      (error, stats) =>
        error || stats.hasErrors()
          ? reject(
              error || new Error(stats.toString({ all: false, errors: true })),
            )
          : resolve(),
    ),
  );
  const app = await electron.launch({
    args: [path.join(directory, 'main.cjs')],
    cwd: root,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const clickFile = (name) =>
      page.getByRole('button', { name, exact: true }).click();
    await clickFile('a.txt');
    await page.locator('.cm-content').fill('edited a');
    await clickFile('b.txt');
    assert.equal(await page.getByRole('tab').count(), 2);
    await page.getByRole('tab', { name: /a.txt/ }).click();
    assert.equal(
      await page.getByRole('tabpanel').locator('.cm-content').innerText(),
      'edited a',
    );
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+s' : 'Control+s',
    );
    await page.waitForFunction(
      () => !document.querySelector('[role=tab] [aria-label="未保存"]'),
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, 'a.txt'), 'utf8'),
      'edited a',
    );
    // Create from root toolbar.
    await page.getByRole('button', { name: '新建文件', exact: true }).click();
    await page
      .getByRole('textbox', { name: '文件或文件夹名称' })
      .fill('new.txt');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '新建文件', exact: true })
      .click();
    await page.getByRole('tab', { name: 'new.txt', exact: true }).waitFor();
    assert(fs.existsSync(path.join(workspace, 'new.txt')));
    // Rename and keep its tab selected.
    await page
      .getByRole('button', { name: 'new.txt', exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    await page
      .getByRole('textbox', { name: '文件或文件夹名称' })
      .fill('renamed.txt');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '重命名', exact: true })
      .click();
    await page.getByRole('tab', { name: 'renamed.txt', exact: true }).waitFor();
    assert(!fs.existsSync(path.join(workspace, 'new.txt')));
    // Real OS trash, only a newly created empty temporary file.
    await page
      .getByRole('button', { name: 'renamed.txt', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: '移到回收站', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '移到回收站', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page
      .getByRole('tab', { name: 'renamed.txt', exact: true })
      .waitFor({ state: 'detached' });
    assert(!fs.existsSync(path.join(workspace, 'renamed.txt')));
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await page.getByRole('textbox', { name: '文件或文件夹名称' }).fill('docs');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '新建文件夹', exact: true })
      .click();
    await page.getByText('docs', { exact: true }).waitFor();
    await page.getByText('docs', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '新建文件', exact: true }).click();
    await page
      .getByRole('textbox', { name: '文件或文件夹名称' })
      .fill('child.txt');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '新建文件', exact: true })
      .click();
    await page.getByRole('tab', { name: 'child.txt', exact: true }).waitFor();
    assert(fs.existsSync(path.join(workspace, 'docs', 'child.txt')));
    // External changes are picked up on every collapse/expand cycle.
    const folder = page.getByRole('button', { name: 'docs', exact: true });
    await folder.click();
    fs.writeFileSync(path.join(workspace, 'docs', 'external.txt'), 'external');
    await folder.click();
    await page
      .getByRole('button', { name: 'external.txt', exact: true })
      .waitFor();
    await folder.click();
    fs.unlinkSync(path.join(workspace, 'docs', 'external.txt'));
    await folder.click();
    await page
      .getByRole('button', { name: 'external.txt', exact: true })
      .waitFor({ state: 'detached' });

    // Renaming a folder protects dirty descendants and updates all open paths.
    await page.getByRole('tabpanel').locator('.cm-content').fill('child draft');
    await page.getByText('docs', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    await page.getByRole('textbox', { name: '文件或文件夹名称' }).fill('notes');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '重命名', exact: true })
      .click();
    await page.getByRole('alert').filter({ hasText: '请先保存' }).waitFor();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '取消', exact: true })
      .click();
    await page.getByRole('tabpanel').locator('.cm-content').click();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+s' : 'Control+s',
    );
    await page.waitForFunction(
      () => !document.querySelector('[role=tab] [aria-label="未保存"]'),
    );
    await page.getByText('docs', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click();
    await page.getByRole('textbox', { name: '文件或文件夹名称' }).fill('notes');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '重命名', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page
        .getByRole('tab', { name: 'child.txt', exact: true })
        .getAttribute('title'),
      path.join(workspace, 'notes', 'child.txt'),
    );
    assert.equal(
      fs.readFileSync(path.join(workspace, 'notes', 'child.txt'), 'utf8'),
      'child draft',
    );
    await page.getByText('notes', { exact: true }).click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: '移到回收站', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '移到回收站', exact: true })
      .click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page.getByRole('tab', { name: 'child.txt', exact: true }).count(),
      0,
    );
    assert(!fs.existsSync(path.join(workspace, 'notes')));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(directory, 'filesystem.png') });
    console.log(
      JSON.stringify({
        ok: true,
        screenshot: path.join(directory, 'filesystem.png'),
        checks: [
          'dirty tab preservation',
          'save active tab',
          'new file',
          'rename and sync tab',
          'system trash and close tab',
          'new folder',
          'nested new file',
          'folder expansion refreshes external additions and deletions',
          'dirty descendant protection',
          'folder rename updates child tabs',
          'folder trash closes child tabs',
        ],
      }),
    );
  } finally {
    await app.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
