import type { WebContents } from 'electron';

/** Wait for document load and network quiet before extracting a dynamic page. */
export async function readBrowserPage(
  wc: WebContents,
  url: string,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error('Web fetch cancelled.');
  // A newly created WebContents has no renderer until its first navigation;
  // debugger commands such as Network.enable otherwise wait indefinitely.
  await wc.loadURL('about:blank');
  if (signal.aborted) throw new Error('Web fetch cancelled.');
  const client = wc.debugger;
  client.attach('1.3');
  const requests = new Set<string>();
  let loaded = false;
  let quiet: ReturnType<typeof setTimeout>;
  let finish: () => void;
  let fail: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const check = () => {
    clearTimeout(quiet);
    if (loaded && !requests.size) quiet = setTimeout(finish, 500);
  };
  const message = (_event: unknown, method: string, params: any) => {
    if (
      method === 'Network.requestWillBeSent' &&
      !['WebSocket', 'EventSource'].includes(params.type)
    )
      requests.add(params.requestId);
    if (
      method === 'Network.loadingFinished' ||
      method === 'Network.loadingFailed'
    )
      requests.delete(params.requestId);
    check();
  };
  const abort = () => {
    fail(new Error('Web fetch cancelled.'));
    if (!wc.isDestroyed()) wc.stop();
  };
  const destroyed = () => fail(new Error('Browser page closed.'));
  client.on('message', message);
  wc.once('destroyed', destroyed);
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    fail(new Error('Browser fetch timed out.'));
    if (!wc.isDestroyed()) wc.stop();
  }, 25000);
  // Attach the rejection handler before navigation can fail or be cancelled.
  const content = ready.then(() => {
    if (signal.aborted) throw new Error('Web fetch cancelled.');
    return wc.executeJavaScript(
      'document.documentElement.outerHTML',
    ) as Promise<string>;
  });
  try {
    if (signal.aborted) abort();
    else {
      client
        .sendCommand('Network.enable')
        .then(() => {
          if (signal.aborted || wc.isDestroyed()) return undefined;
          return wc.loadURL(url);
        })
        .then(() => {
          loaded = true;
          check();
          return undefined;
        })
        .catch(fail);
    }
    return await content;
  } finally {
    clearTimeout(quiet);
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    wc.removeListener('destroyed', destroyed);
    client.removeListener('message', message);
    if (!wc.isDestroyed() && client.isAttached()) client.detach();
  }
}
