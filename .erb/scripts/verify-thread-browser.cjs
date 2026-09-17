const uncaught = [];
process.on('uncaughtException', (error) => {
  uncaught.push(error);
  console.error('UNCAUGHT', error);
});
// Run with: node_modules/.bin/electron .erb/scripts/verify-thread-browser.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'aime-thread-browser-'),
);
app.setPath('userData', directory);
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
});
const { ThreadBrowserManager } = require('../../src/main/browser/manager.ts');
const {
  executeBrowserCommands,
  runBrowserCli,
} = require('../../src/main/browser/automation.ts');
const manager = new ThreadBrowserManager();
const controllers = [];
async function cleanup() {
  for (const controller of controllers)
    await runBrowserCli(
      [
        '--session',
        controller.session,
        '--config',
        controller.configPath,
        'close',
      ],
      { timeout: 2000 },
    ).catch(() => undefined);
  await manager.dispose();
  server.close();
}
const server = http.createServer((req, res) => {
  if (req.url === '/hang') return;
  if (req.url === '/delayed') {
    setTimeout(() => res.end('dynamic-ready'), 800);
    return;
  }
  if (req.url === '/download') {
    res.setHeader('Content-Disposition', 'attachment; filename=proof.txt');
    res.end('browser-download-proof');
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/fetch') {
    res.end(
      `<body data-cookie="${req.headers.cookie || ''}"><h1>/fetch</h1><div id="async"></div><script>fetch('/delayed').then(r=>r.text()).then(text=>document.querySelector('#async').textContent=text)</script></body>`,
    );
    return;
  }
  res.end(
    `<body data-cookie="${req.headers.cookie || ''}"><title>${req.url}</title><h1>${req.url}</h1><label>Name<input id="name" aria-label="Name"></label><button onclick="document.querySelector('#result').textContent=document.querySelector('#name').value">Save</button><output id="result"></output><a id="popup" href="/popup" target="_blank">Open popup</a><a id="download" href="/download">Download</a>`,
  );
});
let win;
const action = (threadId, command, tabId) =>
  executeBrowserCommands(
    { threadId, command, tabId, workspace: directory },
    manager,
  );
async function verifyTargetIsolation(endpoint, ownTarget, foreignTarget) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  let nextId = 0;
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(
        () => reject(new Error('CDP response timed out')),
        3000,
      );
      const onMessage = (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.id !== id) return;
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(message);
      };
      socket.on('message', onMessage);
      socket.send(JSON.stringify({ id, method, params }));
    });
  try {
    const targets = await request('Target.getTargets');
    assert.deepEqual(
      targets.result.targetInfos.map((target) => target.targetId),
      [ownTarget],
    );
    for (const method of [
      'Target.attachToTarget',
      'Target.closeTarget',
      'Target.activateTarget',
    ]) {
      const result = await request(method, { targetId: foreignTarget });
      assert.match(result.error.message, /outside this browser session/);
    }
  } finally {
    socket.close();
  }
}
app
  .whenReady()
  .then(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    win = new BrowserWindow({ width: 1000, height: 760, show: true });
    await win.loadURL(
      'data:text/html,<body style="font:16px system-ui;padding:16px"><h2>AIME Chat browser integration verification</h2><p>Thread A and B share login data and own their tabs.</p></body>',
    );
    manager.setWindow(win);
    try {
      console.log('OPEN', await action('A', `open ${base}/a`));
      console.log('OPEN', await action('B', `open ${base}/b`));
      for (const threadId of ['A', 'B'])
        controllers.push(await manager.controller(threadId, 't1'));
      manager.present({
        threadId: 'A',
        ownerId: 'smoke',
        visible: true,
        bounds: { x: 20, y: 140, width: 950, height: 560 },
      });
      const snapshots = await Promise.all(
        ['A', 'B'].map((id) => action(id, 'snapshot -i')),
      );
      console.log('SNAPSHOTS', snapshots);
      assert(snapshots.every((x) => /Name/.test(x) && /Save/.test(x)));
      const refs = snapshots.map((snapshot) => ({
        name: snapshot.match(/textbox "Name" \[ref=(e\d+)\]/)?.[1],
        save: snapshot.match(/button "Save" \[ref=(e\d+)\]/)?.[1],
      }));
      assert(
        refs.every((ref) => ref.name && ref.save),
        'Snapshot element refs missing',
      );
      const values = await Promise.all([
        action('A', `fill @${refs[0].name} "Alice" && click @${refs[0].save}`),
        action('B', `fill @${refs[1].name} "Bob" && click @${refs[1].save}`),
      ]);
      console.log('ACTIONS', values);
      const a = manager.getCdpTab('A', 't1').webContents;
      const b = manager.getCdpTab('B', 't1').webContents;
      await verifyTargetIsolation(
        controllers[0].endpoint,
        manager.getCdpTab('A', 't1').targetId,
        manager.getCdpTab('B', 't1').targetId,
      );
      console.log(
        'VALUES',
        await a.executeJavaScript(
          '[document.querySelector("#name").value,document.querySelector("#result").textContent]',
        ),
        await b.executeJavaScript(
          '[document.querySelector("#name").value,document.querySelector("#result").textContent]',
        ),
      );
      assert.equal(
        await a.executeJavaScript(
          'document.querySelector("#result").textContent',
        ),
        'Alice',
      );
      assert.equal(
        await b.executeJavaScript(
          'document.querySelector("#result").textContent',
        ),
        'Bob',
      );
      await a.executeJavaScript(
        'document.cookie="auth=shared; path=/"; localStorage.setItem("shared", "yes")',
      );
      assert.match(await b.executeJavaScript('document.cookie'), /auth=shared/);
      assert.equal(
        await b.executeJavaScript('localStorage.getItem("shared")'),
        'yes',
      );
      console.log('NEW', await action('A', `tab new ${base}/second`));
      controllers.push(await manager.controller('A', 't2'));
      await action('A', 'tab t1');
      await manager.action({ threadId: 'A', action: 'select', tabId: 't2' });
      console.log('STABLE', await action('A', 'get url'));
      assert.equal(manager.state('A').automationTabId, 't1');
      await action('A', 'click "#popup"');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(manager.state('A').tabs.length, 3);
      assert.equal(manager.state('B').tabs.length, 1);
      assert.equal(manager.state('A').tabs[2].url, `${base}/popup`);
      await action('A', 'fill "#name" "Second" && click "button"', 't2');
      assert.equal(
        await manager
          .getCdpTab('A', 't2')
          .webContents.executeJavaScript(
            'document.querySelector("#result").textContent',
          ),
        'Second',
      );
      const downloadPath = path.join(directory, 'downloaded.txt');
      console.log(
        'DOWNLOAD',
        await action('B', `download "#download" "${downloadPath}"`),
      );
      assert.equal(
        fs.readFileSync(downloadPath, 'utf8'),
        'browser-download-proof',
      );
      const abort = new AbortController();
      const waiting = executeBrowserCommands(
        {
          threadId: 'A',
          command: 'wait "#never"',
          tabId: 't2',
          signal: abort.signal,
        },
        manager,
      );
      setTimeout(() => abort.abort(), 200);
      await Promise.all([waiting, action('B', 'get title')]);
      assert.equal(manager.state('B').tabs.length, 1);
      const stopped = executeBrowserCommands(
        { threadId: 'A', command: 'wait "#never"', tabId: 't2' },
        manager,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(manager.state('A').runningTabId, 't2');
      await manager.action({
        threadId: 'A',
        action: 'stop',
        tabId: manager.state('A').runningTabId,
      });
      await stopped;
      await action(
        'A',
        'screenshot "' + path.join(directory, 'preview.png') + '"',
        't2',
      );
      console.log('ARTIFACT', path.join(directory, 'preview.png'));
      assert.equal(uncaught.length, 0, 'Unexpected Electron error');
      await action('A', 'tab close t1');
      assert(
        !manager.backgroundWindow.contentView.children.some(
          (view) => view.webContents === a,
        ),
      );
      await assert.rejects(action('A', 'click "button"'), /closed/);
      assert.equal(
        await b.executeJavaScript(
          'document.querySelector("#result").textContent',
        ),
        'Bob',
      );
      console.log(
        'PASS: concurrent actions, shared cookies/storage, multiple tabs, preview-only switching, popup ownership, closed target failure.',
      );
      assert.equal(
        b.session.storagePath,
        path.join(directory, 'instances', 'default_browser'),
      );
      assert.equal(manager.getCdpTab('A', 't2').webContents.session, b.session);
      const beforeFetch = manager.state('A');
      const fetched = await manager.readPage('A', `${base}/fetch`);
      assert.match(fetched, /<h1>\/fetch<\/h1>/);
      assert.match(fetched, /auth=shared/);
      assert.match(fetched, />dynamic-ready<\/div>/);
      assert.equal(manager.state('A').selectedTabId, beforeFetch.selectedTabId);
      assert.equal(
        manager.state('A').automationTabId,
        beforeFetch.automationTabId,
      );
      assert.equal(manager.state('A').tabs.length, beforeFetch.tabs.length);
      const cancelFetch = new AbortController();
      const pendingFetch = manager.readPage(
        'B',
        `${base}/hang`,
        cancelFetch.signal,
      );
      setTimeout(() => cancelFetch.abort(), 100);
      await assert.rejects(pendingFetch);
      assert.equal(manager.state('B').tabs.length, 1);
      let releaseQueue;
      let markStarted;
      const started = new Promise((resolve) => { markStarted = resolve; });
      const blocking = manager.run('B', () => {
        markStarted();
        return new Promise((resolve) => { releaseQueue = resolve; });
      });
      await started;
      let queuedRan = false;
      const queued = manager.run('B', async () => { queuedRan = true; });
      const cancelledQueue = assert.rejects(queued, /closing all tabs/);
      manager.closeAllTabs();
      releaseQueue();
      await Promise.all([blocking, cancelledQueue]);
      assert.equal(queuedRan, false);
      assert.equal(manager.overview().tabCount, 0);
      await action('B', `open ${base}/reopened`);
      const reopened = manager.getCdpTab('B', manager.state('B').automationTabId).webContents;
      assert.equal(await reopened.executeJavaScript('document.cookie'), 'auth=shared');
      assert.equal(manager.overview().tabCount, 1);
      console.log('PASS: canonical profile, dynamic WebFetch, cancellation, stable tab selection, close-all cancels queued actions, reopened page retains cookies.');
      await cleanup();
      await assert.rejects(action('A', 'open about:blank'), /shutting down/);
      app.exit(0);
    } catch (error) {
      console.error(error);
      await cleanup();
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
setTimeout(() => {
  console.error('Smoke test timed out');
  app.exit(2);
}, 110000).unref();
