import fs from 'fs';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

/**
 * Downloads every provider logo (SVG) shown on https://models.dev/providers/
 * and saves each as `assets/model-logos/<slug>.svg`.
 *
 * Strategy (robust by design):
 *   1. Get the authoritative provider slug list from the live `api.json`
 *      (same endpoint the project already uses in update-models-api.ts).
 *      If that is unreachable, fall back to listing the `providers/`
 *      directory via the GitHub API (same source repo behind the site).
 *   2. Scrape the live providers page HTML to discover each provider's
 *      *served* logo URL (so we grab the exact asset the page uses).
 *   3. For every provider, download its logo from the discovered URL;
 *      if that fails, fall back to the models.dev source repo
 *      (`providers/<slug>/logo.svg` on GitHub) which is the same artwork.
 *
 * Networking:
 *   - Honors an HTTP(S) proxy via the `http_proxy` / `https_proxy` env var
 *     (routed through undici's ProxyAgent for the global fetch).
 *   - Every request has a hard timeout so a stalled connection cannot hang
 *     the whole run forever.
 *
 * Run with:  npm run update-model-logos
 * Set FORCE=1 to re-download logos that already exist locally.
 */

const PROVIDERS_PAGE_URL = 'https://models.dev/providers/';
const MODELS_API_URL = 'https://models.dev/api.json';
const GITHUB_API_PROVIDERS =
  'https://api.github.com/repos/anomalyco/models.dev/contents/providers';
const GITHUB_RAW_LOGO = (slug: string): string =>
  `https://raw.githubusercontent.com/anomalyco/models.dev/dev/providers/${slug}/logo.svg`;

const OUTPUT_DIR = path.resolve(__dirname, '../../assets/model-logos');
const MAX_CONCURRENT = 8;
const REQUEST_TIMEOUT_MS = 15_000;
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';
const USER_AGENT = 'aime-chat-model-logos-updater';

// Route global fetch through a proxy when one is configured in the env.
const PROXY_URL =
  process.env.http_proxy ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.HTTPS_PROXY;
if (PROXY_URL) {
  setGlobalDispatcher(new ProxyAgent(PROXY_URL));
  console.log(`Using HTTP(S) proxy from env: ${PROXY_URL}`);
}

// ---------- networking helpers ----------

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/**
 * Fallback slug source: list the `providers/` directory via the GitHub API.
 * A single page with per_page=1000 covers every provider (the count is well
 * under 1000), so there is no pagination loop to drift into rate-limit loops.
 */
async function fetchProviderSlugsFromGitHub(): Promise<string[]> {
  const text = await fetchText(`${GITHUB_API_PROVIDERS}?per_page=1000`);
  if (!text) return [];
  let entries: any[];
  try {
    entries = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && e.type === 'dir' && typeof e.name === 'string')
    .map((e) => e.name as string);
}

function resolveUrl(url: string): string {
  try {
    return new URL(url, 'https://models.dev').toString();
  } catch {
    return url;
  }
}

/** Returns SVG bytes, or null if the source is unusable. */
async function fetchLogoBytes(url: string): Promise<Buffer | null> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);
    const data = url.slice(comma + 1);
    try {
      const buf = meta.includes('base64')
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data), 'utf-8');
      return looksLikeSvg(buf) ? buf : null;
    } catch {
      return null;
    }
  }
  const buf = await fetchBuffer(url);
  if (buf && looksLikeSvg(buf)) return buf;
  return null;
}

function looksLikeSvg(buf: Buffer): boolean {
  const head = buf.toString('utf-8', 0, 256);
  return head.includes('<svg') || head.trimStart().startsWith('<');
}

// ---------- HTML parsing ----------

/**
 * Walk every <a href=".../providers/<slug>"> block and capture the logo
 * <img> (src or srcset) found inside it. Returns slug -> logo URL.
 */
function parseProviderLogos(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const attrs = m[1];
    const inner = m[2];
    const hrefMatch = attrs.match(
      /href\s*=\s*["']([^"']*?\/providers\/([A-Za-z0-9._-]+))["']/i,
    );
    if (!hrefMatch) continue;
    const slug = hrefMatch[2];
    if (map.has(slug)) continue;

    const imgMatch =
      inner.match(/<img[^>]*\bsrc\s*=\s*["']([^"']+)["']/i) ||
      inner.match(/<img[^>]*\bsrcset\s*=\s*["']([^"']+)["']/i);
    if (!imgMatch) continue;

    let url = imgMatch[1];
    if (/srcset/i.test(imgMatch[0])) {
      // srcset is "url size, url size, ..." — take the first url.
      url = url.split(/\s+/)[0];
    }
    map.set(slug, url);
  }
  return map;
}

// ---------- main ----------

async function main(): Promise<void> {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Authoritative provider slug list.
  console.log(`Fetching provider list from ${MODELS_API_URL} ...`);
  const apiJson = await fetchText(MODELS_API_URL);
  let slugs: string[] = [];
  if (apiJson) {
    try {
      const parsed: unknown = JSON.parse(apiJson);
      if (Array.isArray(parsed)) {
        slugs = parsed
          .map((p: any) => p?.id ?? p)
          .filter((x: unknown) => typeof x === 'string');
      } else if (parsed && typeof parsed === 'object') {
        slugs = Object.keys(parsed as Record<string, unknown>);
      }
    } catch {
      /* fall through to empty */
    }
  }
  if (slugs.length === 0) {
    console.log('api.json unreachable; falling back to GitHub provider listing ...');
    slugs = await fetchProviderSlugsFromGitHub();
  }
  if (slugs.length === 0) {
    console.error('Could not determine the provider list from either api.json or GitHub; aborting.');
    process.exitCode = 1;
    return;
  }
  console.log(`Found ${slugs.length} providers.`);

  // 2. Scrape live page for served logo URLs.
  console.log(`Scraping ${PROVIDERS_PAGE_URL} for logo URLs ...`);
  const html = await fetchText(PROVIDERS_PAGE_URL);
  const logoMap = html ? parseProviderLogos(html) : new Map<string, string>();
  console.log(`Discovered ${logoMap.size} logo URLs from the page.`);

  // 3. Download each provider's logo.
  let liveCount = 0;
  let fallbackCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  let index = 0;

  async function downloadOne(slug: string): Promise<void> {
    const outPath = path.join(OUTPUT_DIR, `${slug}.svg`);
    if (!FORCE && fs.existsSync(outPath)) {
      skipCount++;
      return;
    }

    const candidates: string[] = [];
    const liveUrl = logoMap.get(slug);
    if (liveUrl) candidates.push(resolveUrl(liveUrl));
    candidates.push(GITHUB_RAW_LOGO(slug));

    for (const url of candidates) {
      const buf = await fetchLogoBytes(url);
      if (buf && buf.length > 0) {
        fs.writeFileSync(outPath, buf);
        if (url === GITHUB_RAW_LOGO(slug)) {
          fallbackCount++;
          if (liveUrl) console.log(`[fallback] ${slug}`);
        } else {
          liveCount++;
        }
        return;
      }
    }
    skipCount++;
    console.log(`[skip] ${slug} (no usable logo found)`);
  }

  async function worker(): Promise<void> {
    while (index < slugs.length) {
      const i = index++;
      const slug = slugs[i];
      try {
        await downloadOne(slug);
      } catch (err) {
        errorCount++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[error] ${slug}: ${msg}`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT, slugs.length) },
    worker,
  );
  await Promise.all(workers);

  const saved = liveCount + fallbackCount;
  console.log(
    `Done. saved=${saved} (live-page=${liveCount}, repo-fallback=${fallbackCount}), ` +
      `skipped=${skipCount}, errors=${errorCount}`,
  );
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

// Wrap in IIFE to avoid top-level await for broader Node compatibility.
(async () => {
  await main();
})();
