// env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron .erb/scripts/verify-playwright-tool.cjs
/* eslint-disable promise/catch-or-return, promise/always-return -- Standalone Electron smoke exits on success or failure. */
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const WebSocket = require('ws');

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aime-playwright-tool-'),
);
app.setPath('userData', directory);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
});
const {
  threadBrowserManager: manager,
} = require('../../src/main/browser/manager.ts');
const {
  PlaywrightTest,
} = require('../../src/main/tools/test/playwright-test.ts');

const timeout = setTimeout(() => {
  console.error('Playwright tool test timed out');
  app.exit(2);
}, 45000);

async function verifyCookies(tab, other) {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/plain');
    response.end(request.headers.cookie || 'no-cookies');
  });
  let browser;
  try {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    await session.defaultSession.cookies.set({
      url,
      name: 'default-only',
      value: 'keep',
    });
    browser = await chromium.connectOverCDP(
      await manager.bridge.endpoint('test-chat', tab.id),
    );
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    await context.addCookies([
      {
        name: 'by-url',
        value: 'url-value',
        url,
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'by-domain',
        value: 'domain-value',
        domain: '127.0.0.1',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 60,
      },
    ]);
    const cookies = await context.cookies(url);
    assert.deepEqual(cookies.map((cookie) => cookie.name).sort(), [
      'by-domain',
      'by-url',
    ]);
    assert.equal(
      cookies.find((cookie) => cookie.name === 'by-url').httpOnly,
      true,
    );
    assert.deepEqual(
      (await other.webContents.session.cookies.get({ url }))
        .map((cookie) => cookie.name)
        .sort(),
      ['by-domain', 'by-url'],
    );
    await page.goto(url);
    const headers = await page.locator('body').innerText();
    assert(headers.includes('by-url=url-value'));
    assert(headers.includes('by-domain=domain-value'));
    assert(!headers.includes('default-only'));
    const visibleCookies = await page.evaluate(() => document.cookie);
    assert(!visibleCookies.includes('by-url'));
    assert(visibleCookies.includes('by-domain=domain-value'));
    await other.webContents.loadURL(url);
    assert(
      (
        await other.webContents.executeJavaScript('document.body.innerText')
      ).includes('by-url=url-value'),
    );
    await context.addCookies([
      { name: 'by-url', value: 'updated', url, httpOnly: true },
    ]);
    assert.equal(
      (await tab.webContents.session.cookies.get({ url, name: 'by-url' }))[0]
        .value,
      'updated',
    );
    const socket = new WebSocket(
      await manager.bridge.endpoint('test-chat', tab.id),
    );
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    let nextId = 0;
    const send = (method, params) =>
      new Promise((resolve, reject) => {
        nextId += 1;
        const id = nextId;
        const timer = setTimeout(
          () => reject(new Error('CDP request timed out')),
          3000,
        );
        const onMessage = (raw) => {
          const message = JSON.parse(raw.toString());
          if (message.id !== id) return;
          clearTimeout(timer);
          socket.off('message', onMessage);
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result);
        };
        socket.on('message', onMessage);
        socket.send(JSON.stringify({ id, method, params }));
      });
    try {
      await assert.rejects(
        send('Storage.setCookies', {
          browserContextId: 'foreign',
          cookies: [],
        }),
        /foreign browser context/,
      );
      const shared = await send('Storage.getCookies', {
        browserContextId: 'aime-shared-electron',
      });
      assert.equal(
        shared.cookies.find((cookie) => cookie.name === 'by-url').value,
        'updated',
      );
    } finally {
      socket.terminate();
    }
    await context.clearCookies({ name: 'by-url' });
    assert.deepEqual(
      (await context.cookies(url)).map((cookie) => cookie.name),
      ['by-domain'],
    );
    await context.clearCookies();
    assert.equal((await context.cookies(url)).length, 0);
    assert.equal(
      (await other.webContents.session.cookies.get({ url })).length,
      0,
    );
    assert.equal(
      (
        await session.defaultSession.cookies.get({ url, name: 'default-only' })
      )[0].value,
      'keep',
    );
    console.log(
      'PASS: Playwright add/read/update/filtered-clear/clear cookies, HTTP request headers, HttpOnly, shared threads, default-session isolation, foreign-context rejection.',
    );
  } finally {
    await browser?.close();
    manager.bridge.disconnect('test-chat', tab.id);
    server.closeAllConnections();
    server.close();
  }
}

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
    const result = await registeredTool.execute(
      { text: '你好，Playwright！' },
      { requestContext: context },
    );
    assert.equal(result.success, true);
    assert.equal(result.result, '你好，Playwright！');
    assert.equal(result.previewAvailable, true);
    assert.equal(result.cookiesVerified, true);
    const tab = manager.getCdpTab('test-chat', result.tabId);
    assert.equal(tab.webContents.session, other.webContents.session);
    assert.equal(
      tab.webContents.session.storagePath,
      path.join(directory, 'instances/default_browser'),
    );
    assert.equal(
      await tab.webContents.executeJavaScript(
        'document.querySelector("#result").textContent',
      ),
      result.result,
    );
    assert.equal(
      await other.webContents.executeJavaScript(
        'document.querySelector("#result")',
      ),
      null,
    );
    manager.present({
      threadId: 'test-chat',
      ownerId: 'playwright-test-fixture',
      visible: true,
      bounds: { x: 0, y: 0, width: 800, height: 520 },
    });
    fs.writeFileSync(
      path.join(directory, 'playwright-result.png'),
      (await tab.webContents.capturePage()).toPNG(),
    );
    assert.equal(tab.webContents.debugger.isAttached(), false);
    assert.equal(
      (
        await tab.webContents.session.cookies.get({
          url: 'https://playwright-test.invalid/',
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await session.defaultSession.cookies.get({
          url: 'https://playwright-test.invalid/',
        })
      ).length,
      0,
    );
    const existing = manager.overview().tabCount;
    const panelResult = await tool.execute({});
    assert.equal(panelResult.result, 'Hello from Playwright');
    assert.equal(panelResult.previewAvailable, false);
    assert.equal(manager.overview().tabCount, existing);
    assert.equal(manager.registry.threads.size, 2);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      tool.execute({}, { requestContext: context, abortSignal: abort.signal }),
    );
    assert.equal(manager.overview().tabCount, existing);
    console.log(JSON.stringify(result));
    await verifyCookies(tab, other);
    console.log(
      'PASS: actual PlaywrightTest.execute, native Electron shared session, fill/click/read, other chat untouched, preview retained, panel cleanup, cancelled queue.',
    );
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
