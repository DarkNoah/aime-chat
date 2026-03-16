const fs = require('fs');
const path = require('path');
const https = require('https');

const rootDir = path.resolve(__dirname, '..', '..');
const redistDir = path.join(rootDir, 'assets', 'windows-redist');

const redists = [
  {
    filename: 'vc_redist.x64.exe',
    url:
      process.env.VC_REDIST_X64_URL ||
      'https://aka.ms/vs/17/release/vc_redist.x64.exe',
  },
  {
    filename: 'vc_redist.x86.exe',
    url:
      process.env.VC_REDIST_X86_URL ||
      'https://aka.ms/vs/17/release/vc_redist.x86.exe',
  },
];

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        download(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(
          new Error(`Failed to download ${url}, status: ${response.statusCode}`),
        );
        return;
      }

      const fileStream = fs.createWriteStream(destination);

      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });

      fileStream.on('error', (error) => {
        fs.rmSync(destination, { force: true });
        reject(error);
      });

      response.on('error', (error) => {
        fs.rmSync(destination, { force: true });
        reject(error);
      });

      response.pipe(fileStream);
    });

    request.on('error', (error) => {
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

async function ensureRedist({ filename, url }) {
  const targetPath = path.join(redistDir, filename);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    console.log(`[vc-redist] using cached ${filename}`);
    return;
  }

  console.log(`[vc-redist] downloading ${filename} from ${url}`);
  await download(url, targetPath);
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[vc-redist] skip on non-Windows host');
    return;
  }

  if (process.env.SKIP_VC_REDIST_DOWNLOAD === '1') {
    console.log('[vc-redist] skipped by SKIP_VC_REDIST_DOWNLOAD=1');
    return;
  }

  fs.mkdirSync(redistDir, { recursive: true });

  for (const redist of redists) {
    await ensureRedist(redist);
  }
}

main().catch((error) => {
  console.error('[vc-redist] failed to prepare redistributables');
  console.error(error);
  process.exit(1);
});
