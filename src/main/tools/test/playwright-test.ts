import { randomUUID } from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import z from 'zod';
import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import BaseTool from '../base-tool';
import { threadBrowserManager } from '../../browser/manager';
import { CdpTab } from '@/main/browser/cdp-bridge';

const testPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>Playwright 接入测试</title></head><body>
<h1>Playwright 接入测试</h1>
<p>此页面运行在 AIME Chat 的 Electron Chromium 中。</p>
<label>测试文字 <input id="message" aria-label="测试文字"></label>
<button onclick="document.querySelector('#result').textContent = document.querySelector('#message').value">确认</button>
<p>点击结果：<output id="result" aria-live="polite"></output></p>
</body></html>`;

const testCookieUrl = 'https://playwright-test.invalid/';

/** A bounded demonstration, not an arbitrary script execution tool. */
export class PlaywrightTest extends BaseTool {
  static readonly toolName = 'PlaywrightTest';

  id = 'PlaywrightTest';

  description =
    'Test Playwright against the existing Electron browser. Creates a new local test tab, writes and reads a temporary test cookie, fills text, clicks a button, and reads the result. The test cookie is removed afterward. Chat calls leave the result visible in the browser preview. Calls from the tool test panel clean up their temporary tab. Does not launch a separate browser or navigate external sites.';

  inputSchema = z
    .object({
      text: z
        .string()
        .min(1)
        .max(500)
        .default('Hello from Playwright')
        .describe('Text to fill and verify after clicking the test button.'),
    })
    .strict();

  execute = async (
    input: z.input<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { text } = this.inputSchema.parse(input);
    const chatId = options?.requestContext?.get('threadId' as never) as
      | string
      | undefined;
    const owner = chatId || `playwright-test:${randomUUID()}`;
    const manager = threadBrowserManager;
    try {
      return await manager.run(
        owner,
        async (data, signal?: AbortSignal) => {
          // const tab = manager.createCdpTab(owner, 'about:blank');
          const cookieStore = data?.tab?.webContents.session.cookies;
          const cookieName = `aime_playwright_test_${randomUUID()}`;
          const cookieValue = randomUUID();

          let browser: Browser | undefined;
          // const cancel = () => manager.bridge.disconnect(owner, tab.id);
          // manager.setRunningTab(owner, tabId);
          //if (chatId) manager.requestPreview(owner);
          // const endpoint = await manager.bridge.endpoint(owner, data.tab.id);
          // signal?.throwIfAborted();
          // // Connect to the owned native page; never call chromium.launch().
          // browser = await chromium.connectOverCDP(endpoint, {
          //   timeout: 10000,
          // });
          signal?.throwIfAborted();
          // const context = browser.contexts()[0];
          // const page = context?.pages()[0];
          let page = data?.page;
          if (!page) throw new Error('Electron test tab was not discovered.');

          const context = data.page.context();
          await context.addCookies([
            {
              name: cookieName,
              value: cookieValue,
              url: testCookieUrl,
              httpOnly: true,
              secure: true,
              sameSite: 'Lax',
            },
          ]);
          const cookies = await context.cookies(testCookieUrl);
          const storedCookies = await cookieStore.get({
            url: testCookieUrl,
            name: cookieName,
          });
          if (
            !cookies.some(
              (cookie) =>
                cookie.name === cookieName && cookie.value === cookieValue,
            ) ||
            storedCookies[0]?.value !== cookieValue
          )
            throw new Error(
              'Playwright cookie verification failed in the Electron session.',
            );
          page.setDefaultTimeout(10000);
          await page.waitForTimeout(10000);

          await page.setContent(testPage);
          await page.getByRole('textbox', { name: '测试文字' }).fill(text);
          await page
            .getByRole('button', { name: '确认', exact: true })
            .click();
          const result = await page.locator('#result').innerText();
          signal?.throwIfAborted();
          if (result !== text)
            throw new Error('Playwright click verification failed.');
          await cookieStore.remove(testCookieUrl, cookieName);
          return {
            success: true,
            engine: 'Electron Chromium',
            tabId: data?.tab?.id,
            actions: ['addCookies', 'cookies', 'fill', 'click', 'readText'],
            cookiesVerified: true,
            result,
            previewAvailable: !!chatId,
          };
        },
        {
          signal: options?.abortSignal,
          requestPreview: !!chatId,
          newTab: true,
          autoHandleConnect: true
        }
      );
    } finally {
      if (!chatId) {
        manager.closeThread(owner);
        manager.registry.threads.delete(owner);
      }
    }
  };
}
