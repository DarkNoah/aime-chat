import spawn from 'cross-spawn';

export interface BrowserCommandResult {
  output: string;
  code: number;
  cancelled: boolean;
}

export function runBrowserCli(
  args: string[],
  options: { cwd?: string; signal?: AbortSignal; timeout?: number } = {},
): Promise<BrowserCommandResult> {
  if (options.signal?.aborted)
    return Promise.resolve({
      output: 'Browser action cancelled.',
      code: 1,
      cancelled: true,
    });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('AGENT_BROWSER_'),
    ),
  );
  return new Promise((resolve, reject) => {
    const child = spawn('agent-browser', args, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let cancelled = false;
    const capture = (data: Buffer) => {
      output = (output + data.toString('utf8')).slice(-128000);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);
    const abort = () => {
      cancelled = true;
      child.kill();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => {
      output += '\nBrowser command timed out.';
      abort();
    }, options.timeout ?? 90000);
    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('close', (code) => {
      cleanup();
      resolve({ output, code: code ?? 1, cancelled });
    });
    if (options.signal?.aborted) abort();
  });
}
