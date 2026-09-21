/* eslint-disable no-await-in-loop -- Each navigation checks the same session sequentially. */
// Run with: node .erb/scripts/verify-browser-tls.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

async function verify() {
  const { app, session } = require('electron');
  const directory = process.env.AIME_TLS_TEST_DIRECTORY;
  const enabled = process.env.AIME_TLS_TEST_ENABLED === 'true';
  app.setPath('userData', path.join(directory, 'profile'));
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
  });
  const { ThreadBrowserManager } = require('../../src/main/browser/manager.ts');
  const manager = new ThreadBrowserManager();
  let server;
  const timeout = setTimeout(() => app.exit(1), 30000);
  try {
    await app.whenReady();
    server = https.createServer(
      {
        key: fs.readFileSync(path.join(directory, 'key.pem')),
        cert: fs.readFileSync(path.join(directory, 'cert.pem')),
      },
      (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        response.end('<title>TLS proof</title>accepted');
      },
    );
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `https://127.0.0.1:${server.address().port}/`;
    await manager.setInsecureTls(enabled);
    assert.equal(manager.overview().insecureTlsRestartRequired, false);
    const tabs = [];
    for (const threadId of ['first', 'second']) {
      const { webContents } = manager.createCdpTab(threadId, 'about:blank');
      await new Promise((resolve) => {
        webContents.once('did-finish-load', resolve);
      });
      tabs.push(webContents);
      if (enabled) {
        await webContents.loadURL(url);
        assert.equal(webContents.getTitle(), 'TLS proof');
      } else {
        await assert.rejects(webContents.loadURL(url), /ERR_CERT/);
      }
    }
    await assert.rejects(session.defaultSession.fetch(url));
    await manager.setInsecureTls(!enabled);
    assert.equal(manager.overview().insecureTlsRestartRequired, true);
    // The active policy remains unchanged until restart; the UI reports it.
    if (enabled) await tabs[0].loadURL(url);
    else await assert.rejects(tabs[0].loadURL(url), /ERR_CERT/);
    await manager.setInsecureTls(enabled);
    assert.equal(manager.overview().insecureTlsRestartRequired, false);
    console.log(
      `PASS: ignore=${enabled}, both threads, app-session isolation, restart indication`,
    );
  } finally {
    clearTimeout(timeout);
    await manager.dispose();
    server?.closeAllConnections();
    server?.close();
  }
}

if (process.versions.electron) {
  const { app } = require('electron');
  verify()
    .then(() => app.exit(0))
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
} else {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-browser-tls-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        path.join(directory, 'key.pem'),
        '-out',
        path.join(directory, 'cert.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
      ],
      { stdio: 'pipe' },
    );
    const env = { ...process.env, AIME_TLS_TEST_DIRECTORY: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    // Reuse the same profile and certificate across real application restarts.
    for (const enabled of [false, true, false]) {
      execFileSync(require('electron'), [__filename], {
        env: { ...env, AIME_TLS_TEST_ENABLED: String(enabled) },
        stdio: 'inherit',
        timeout: 35000,
      });
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
