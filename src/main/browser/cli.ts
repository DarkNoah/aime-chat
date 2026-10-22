import spawn from 'cross-spawn';
import { getAgentBrowserCommand } from '../app/agent-browser-runtime';
import { acquireRuntimeUse } from '../app/runtime-maintenance';

export interface BrowserCommandResult {
  output: string;
  code: number;
  cancelled: boolean;
}

export async function runBrowserCli(
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
  const release = acquireRuntimeUse();
  const cli = getAgentBrowserCommand();
  try {
    return await new Promise<BrowserCommandResult>((resolve, reject) => {
      const child = spawn(cli.command, [...cli.args, ...args], {
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
  } finally {
    release();
  }
}
