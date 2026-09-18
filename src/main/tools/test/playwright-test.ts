import { randomUUID } from 'node:crypto';
import { chromium, type Browser } from 'playwright';
import z from 'zod';
import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
import BaseTool from '../base-tool';
import { threadBrowserManager } from '../../browser/manager';

const testPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>Playwright 接入测试</title></head><body>
<h1>Playwright 接入测试</h1>
<p>此页面运行在 AIME Chat 的 Electron Chromium 中。</p>
<label>测试文字 <input id="message" aria-label="测试文字"></label>
<button onclick="document.querySelector('#result').textContent = document.querySelector('#message').value">确认</button>
<p>点击结果：<output id="result" aria-live="polite"></output></p>
</body></html>`;

/** A bounded demonstration, not an arbitrary script execution tool. */
export class PlaywrightTest extends BaseTool {
  static readonly toolName = 'PlaywrightTest';

  id = 'PlaywrightTest';

  description =
    'Test Playwright against the existing Electron browser. Creates a new local test tab, fills text, clicks a button, and reads the result. Chat calls leave the result visible in the browser preview. Calls from the tool test panel clean up their temporary tab. Does not launch a separate browser or navigate external sites.';

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
        async () => {
          const tab = manager.createCdpTab(owner, 'about:blank');
          const signal = AbortSignal.any([
            manager.registry.get(owner, tab.id).value.abort.signal,
            ...(options?.abortSignal ? [options.abortSignal] : []),
          ]);
          let browser: Browser | undefined;
          const cancel = () => manager.bridge.disconnect(owner, tab.id);
          signal.addEventListener('abort', cancel, { once: true });
          try {
            manager.setRunningTab(owner, tab.id);
            if (chatId) manager.requestPreview(owner);
            const endpoint = await manager.bridge.endpoint(owner, tab.id);
            signal.throwIfAborted();
            // Connect to the owned native page; never call chromium.launch().
            browser = await chromium.connectOverCDP(endpoint, {
              timeout: 10000,
            });
            signal.throwIfAborted();
            const page = browser.contexts()[0]?.pages()[0];
            if (!page) throw new Error('Electron test tab was not discovered.');
            page.setDefaultTimeout(10000);
            await page.setContent(testPage);
            await page.getByRole('textbox', { name: '测试文字' }).fill(text);
            await page
              .getByRole('button', { name: '确认', exact: true })
              .click();
            const result = await page.locator('#result').innerText();
            signal.throwIfAborted();
            if (result !== text)
              throw new Error('Playwright click verification failed.');
            return {
              success: true,
              engine: 'Electron Chromium',
              tabId: tab.id,
              actions: ['fill', 'click', 'readText'],
              result,
              previewAvailable: !!chatId,
            };
          } finally {
            signal.removeEventListener('abort', cancel);
            // For a CDP connection close() disconnects Playwright; the native
            // page remains owned by the chat and is available for inspection.
            await browser?.close().catch(() => undefined);
            manager.bridge.disconnect(owner, tab.id);
          }
        },
        options?.abortSignal,
      );
    } finally {
      if (!chatId) {
        manager.closeThread(owner);
        manager.registry.threads.delete(owner);
      }
    }
  };
}
