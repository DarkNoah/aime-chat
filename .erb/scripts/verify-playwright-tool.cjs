// env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron .erb/scripts/verify-playwright-tool.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-playwright-tool-'));
app.setPath('userData', directory);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
});
const { threadBrowserManager: manager } = require('../../src/main/browser/manager.ts');
const { PlaywrightTest } = require('../../src/main/tools/browser/playwright-test.ts');
const timeout = setTimeout(() => {
  console.error('Playwright tool test timed out');
  app.exit(2);
}, 45000);

app.whenReady().then(async () => {
  let win;
  try {
    const { RequestContext } = await import('@mastra/core/request-context');
    const { createTool } = await import('@mastra/core/tools');
    win = new BrowserWindow({ width: 800, height: 560, show: true });
    manager.setWindow(win);
    await win.loadURL('about:blank');
    const other = manager.createCdpTab('other-chat', 'about:blank');
    const tool = new PlaywrightTest();
    const context = new RequestContext();
    context.set('threadId', 'test-chat');
    const registeredTool = createTool(tool);
    const result = await registeredTool.execute({ text: '你好，Playwright！' }, { requestContext: context });
    assert.equal(result.success, true);
    assert.equal(result.result, '你好，Playwright！');
    assert.equal(result.previewAvailable, true);
    const tab = manager.getCdpTab('test-chat', result.tabId);
    assert.equal(tab.webContents.session, other.webContents.session);
    assert.equal(tab.webContents.session.storagePath, path.join(directory, 'instances/default_browser'));
    assert.equal(await tab.webContents.executeJavaScript('document.querySelector("#result").textContent'), result.result);
    assert.equal(await other.webContents.executeJavaScript('document.querySelector("#result")'), null);
    manager.present({ threadId: 'test-chat', ownerId: 'playwright-test-fixture', visible: true, bounds: { x: 0, y: 0, width: 800, height: 520 } });
    fs.writeFileSync(path.join(directory, 'playwright-result.png'), (await tab.webContents.capturePage()).toPNG());
    assert.equal(tab.webContents.debugger.isAttached(), false);
    const existing = manager.overview().tabCount;
    const panelResult = await tool.execute({});
    assert.equal(panelResult.result, 'Hello from Playwright');
    assert.equal(panelResult.previewAvailable, false);
    assert.equal(manager.overview().tabCount, existing);
    assert.equal(manager.registry.threads.size, 2);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(tool.execute({}, { requestContext: context, abortSignal: abort.signal }));
    assert.equal(manager.overview().tabCount, existing);
    console.log(JSON.stringify(result));
    console.log('PASS: actual PlaywrightTest.execute, native Electron shared session, fill/click/read, other chat untouched, preview retained, panel cleanup, cancelled queue.');
    console.log('SCREENSHOT', path.join(directory, 'playwright-result.png'));
    clearTimeout(timeout);
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
