import { parse } from 'shell-quote';

const reservedFlags = new Set([
  '--session',
  '--session-name',
  '--cdp',
  '--cdp-url',
  '--config',
  '--profile',
  '--auto-connect',
  '--provider',
  '-p',
  '--executable-path',
  '--extension',
  '--state',
  '--restore',
  '--all',
  '--engine',
  '--connect',
  '--headed',
]);
const reservedCommands = new Set([
  'connect',
  'install',
  'upgrade',
  'doctor',
  'dashboard',
  'chat',
  'session',
  'profiles',
  'batch',
  'stream',
  'inspect',
]);

/** Parse arguments without evaluating a shell; connection identity is app-owned. */
export function parseBrowserCommands(command: string): string[][] {
  const tokens = parse(command, (key) => `$${key}`);
  const commands: string[][] = [[]];
  for (const token of tokens) {
    if (typeof token === 'string') commands[commands.length - 1].push(token);
    else if ('op' in token && token.op === '&&') commands.push([]);
    else
      throw new Error(
        'Use browser commands joined with &&. Shell scripts, pipes and redirects are not supported by AgentBrowser.',
      );
  }
  for (const args of commands) {
    if (args[0] === 'agent-browser') args.shift();
    const formatting: string[] = [];
    while (['--json', '--debug'].includes(args[0]))
      formatting.push(args.shift()!);
    if (!args.length) throw new Error('A browser command is required.');
    if (args[0]?.startsWith('-'))
      throw new Error(
        'Start with a browser action; put its options after the action.',
      );
    args.push(...formatting);
    if (reservedCommands.has(args[0]))
      throw new Error(
        `${args[0]} is managed by AIME Chat. Use AgentBrowser to operate this thread's tabs.`,
      );
    if (args.some((arg) => reservedFlags.has(arg.split('=')[0]))) {
      throw new Error(
        'Browser connection/session options are managed by AIME Chat and cannot be overridden.',
      );
    }
  }
  return commands;
}

export function normalizeBrowserUrl(value: string) {
  const input = value.trim();
  const url = new URL(
    /^[a-z][a-z\d+.-]*:/i.test(input) && !/^localhost:\d+/i.test(input)
      ? input
      : `${/^(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(input) ? 'http' : 'https'}://${input}`,
  );
  if (
    !['http:', 'https:', 'file:', 'data:'].includes(url.protocol) &&
    url.href !== 'about:blank'
  ) {
    throw new Error('Use an HTTP, HTTPS, file URL, or about:blank.');
  }
  return url.href;
}
