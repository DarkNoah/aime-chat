// node .erb/scripts/verify-browser-profile-migration.cjs
// Two separate Electron launches prove cookie/storage persistence across migration.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-profile-e2e-'));
  for (const phase of ['seed', 'verify']) {
    const result = spawnSync(require('electron'), [__filename, phase, root], {
      stdio: 'inherit',
      timeout: 25000,
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log(
    'PASS: migrated real Electron cookies and localStorage; removed legacy profile; repeat migration preserved new data.',
  );
  console.log('MIGRATION_FIXTURE', root);
} else {
  const { app, session, BrowserWindow } = require('electron');
  const [phase, root] = process.argv.slice(2);
  app.setPath('userData', root);
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { module: 'commonjs', moduleResolution: 'node' },
  });
  const {
    migrateBrowserProfile,
    browserProfilePath,
  } = require('../../src/main/browser/profile.ts');
  app
    .whenReady()
    .then(async () => {
      let ses;
      if (phase === 'seed') {
        fs.mkdirSync(path.join(browserProfilePath(root), 'Default'), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(browserProfilePath(root), 'Default', 'obsolete'),
          'old-external-browser',
        );
        ses = session.fromPartition('persist:aime-browser');
      } else {
        ses = session.fromPath(migrateBrowserProfile(root));
        assert.equal(ses.storagePath, browserProfilePath(root));
        assert(!fs.existsSync(path.join(browserProfilePath(root), 'Default')));
        assert(!fs.existsSync(path.join(root, 'Partitions', 'aime-browser')));
      }
      ses.protocol.handle(
        'https',
        () =>
          new Response('<html><body>Profile migration test</body></html>', {
            headers: { 'Content-Type': 'text/html' },
          }),
      );
      const win = new BrowserWindow({
        show: false,
        webPreferences: { session: ses },
      });
      await win.loadURL('https://migration.example/');
      if (phase === 'seed') {
        await ses.cookies.set({
          url: 'https://migration.example',
          name: 'migration-login',
          value: 'preserved',
          expirationDate: Math.floor(Date.now() / 1000) + 3600,
        });
        await win.webContents.executeJavaScript(
          'localStorage.setItem("migration-storage", "preserved")',
        );
      } else {
        const cookies = await ses.cookies.get({ name: 'migration-login' });
        assert.equal(cookies[0]?.value, 'preserved');
        assert.equal(
          await win.webContents.executeJavaScript(
            'localStorage.getItem("migration-storage")',
          ),
          'preserved',
        );
        assert.equal(migrateBrowserProfile(root), browserProfilePath(root));
        assert.equal(
          (await ses.cookies.get({ name: 'migration-login' }))[0].value,
          'preserved',
        );
      }
      ses.flushStorageData();
      await ses.cookies.flushStore();
      win.destroy();
      app.quit();
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
}
