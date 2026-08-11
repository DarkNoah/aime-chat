import { spawn } from 'child_process';
import readline from 'readline';
import { parse } from 'shell-quote';
import { getRgPath } from '@/main/utils/ripgrep';

export const DEFAULT_MAX_KNOWLEDGE_BASE_LINES = 2000;
export const MAX_KNOWLEDGE_BASE_LINE_LENGTH = 2000;

type GrepEntry = {
  lineNumber: number;
  text: string;
};

type GrepRequest = {
  args: string[];
  patterns: string[];
};

export type ReadKnowledgeBaseContentOptions = {
  grep?: string;
  offset?: number;
  limit?: number;
  abortSignal?: AbortSignal;
};

const parseNonNegativeInteger = (value: string, option: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${option} requires a non-negative integer`);
  }
  return parsed;
};

/**
 * Accept either a raw ripgrep-compatible pattern or a safe grep/rg command.
 * Commands are parsed and translated to argv; they are never passed to a shell.
 */
const parseGrepRequest = (value: string): GrepRequest => {
  const input = value.trim();
  if (!input) {
    throw new Error('grep must not be empty');
  }
  if (!/^(?:grep|rg)\s+/.test(input)) {
    return { args: [], patterns: [input] };
  }

  const parsed = parse(input);
  if (parsed.some((token) => typeof token !== 'string')) {
    throw new Error(
      'grep commands do not support pipes, redirects, substitutions, or shell operators',
    );
  }
  const tokens = parsed as string[];
  const command = tokens.shift();
  if (command !== 'grep' && command !== 'rg') {
    throw new Error('grep command must start with grep or rg');
  }

  const args: string[] = [];
  const patterns: string[] = [];
  let positionalPatternSeen = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const compactContext = token.match(/^-(A|B|C)(\d+)$/);
    const longContext = token.match(
      /^--(after-context|before-context|context)=(\d+)$/,
    );

    if (token === '-e' || token === '--regexp') {
      const pattern = tokens[index + 1];
      if (pattern === undefined) {
        throw new Error(`${token} requires a pattern`);
      }
      patterns.push(pattern);
      index += 1;
    } else if (token.startsWith('--regexp=')) {
      patterns.push(token.slice('--regexp='.length));
    } else if (token === '-A' || token === '-B' || token === '-C') {
      const count = tokens[index + 1];
      if (count === undefined) {
        throw new Error(`${token} requires a line count`);
      }
      args.push(token, String(parseNonNegativeInteger(count, token)));
      index += 1;
    } else if (compactContext) {
      args.push(
        `-${compactContext[1]}`,
        String(
          parseNonNegativeInteger(compactContext[2], `-${compactContext[1]}`),
        ),
      );
    } else if (
      token === '--after-context' ||
      token === '--before-context' ||
      token === '--context'
    ) {
      const count = tokens[index + 1];
      if (count === undefined) {
        throw new Error(`${token} requires a line count`);
      }
      args.push(token, String(parseNonNegativeInteger(count, token)));
      index += 1;
    } else if (longContext) {
      args.push(
        `--${longContext[1]}`,
        String(parseNonNegativeInteger(longContext[2], token)),
      );
    } else if (token === '-i' || token === '--ignore-case') {
      args.push('--ignore-case');
    } else if (token === '-F' || token === '--fixed-strings') {
      args.push('--fixed-strings');
    } else if (token === '-w' || token === '--word-regexp') {
      args.push('--word-regexp');
    } else if (token === '-x' || token === '--line-regexp') {
      args.push('--line-regexp');
    } else if (token === '-v' || token === '--invert-match') {
      args.push('--invert-match');
    } else if (
      token === '-n' ||
      token === '--line-number' ||
      token === '-E' ||
      token === '--extended-regexp'
    ) {
      // Output is always line-numbered and ripgrep already uses extended regex.
    } else if (/^-[inEFwxv]+$/.test(token)) {
      for (const flag of token.slice(1)) {
        if (flag === 'i') args.push('--ignore-case');
        if (flag === 'F') args.push('--fixed-strings');
        if (flag === 'w') args.push('--word-regexp');
        if (flag === 'x') args.push('--line-regexp');
        if (flag === 'v') args.push('--invert-match');
      }
    } else if (token.startsWith('-')) {
      throw new Error(`Unsupported grep option: ${token}`);
    } else {
      if (positionalPatternSeen || patterns.length > 0) {
        throw new Error(
          'grep paths are not supported; KnowledgeBaseGetItem always searches the selected item',
        );
      }
      patterns.push(token);
      positionalPatternSeen = true;
    }
  }

  if (patterns.length === 0) {
    throw new Error('grep command requires a pattern');
  }
  return { args, patterns };
};

const truncateLine = (value: string): { value: string; truncated: boolean } => {
  if (value.length <= MAX_KNOWLEDGE_BASE_LINE_LENGTH) {
    return { value, truncated: false };
  }
  return {
    value: `${value.slice(0, MAX_KNOWLEDGE_BASE_LINE_LENGTH)}... [truncated]`,
    truncated: true,
  };
};

const formatEntries = (entries: GrepEntry[]): string => {
  if (entries.length === 0) return '';
  const width = Math.max(
    6,
    ...entries.map((entry) => String(entry.lineNumber).length),
  );
  return entries
    .map(
      (entry) =>
        `${String(entry.lineNumber).padStart(width, ' ')}→${entry.text}`,
    )
    .join('\n');
};

const grepContent = async (
  content: string,
  request: GrepRequest,
  offset: number,
  limit: number,
  abortSignal?: AbortSignal,
): Promise<{
  entries: GrepEntry[];
  total: number;
  linesWereTruncatedInLength: boolean;
}> => {
  const args = ['--json', '--text', '--no-messages', ...request.args];
  for (const pattern of request.patterns) {
    args.push('-e', pattern);
  }
  args.push('-');

  const child = spawn(getRgPath(), args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.on('error', () => undefined);
  child.stdin.end(content);

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });
  const entries: GrepEntry[] = [];
  let total = 0;
  let linesWereTruncatedInLength = false;

  const stdoutPromise = (async () => {
    for await (const line of rl) {
      const event = JSON.parse(line) as {
        type?: string;
        data?: {
          line_number?: number;
          lines?: { text?: string };
        };
      };
      if (event.type === 'match' || event.type === 'context') {
        const lineNumber = event.data?.line_number;
        if (lineNumber) {
          const rawText = String(event.data?.lines?.text ?? '').replace(
            /\r?\n$/,
            '',
          );
          if (total >= offset && entries.length < limit) {
            const truncated = truncateLine(rawText);
            linesWereTruncatedInLength ||= truncated.truncated;
            entries.push({ lineNumber, text: truncated.value });
          }
          total += 1;
        }
      }
    }
  })();
  const stderrPromise = (async () => {
    let stderr = '';
    for await (const chunk of child.stderr) {
      stderr += chunk.toString();
    }
    return stderr;
  })();
  const exitPromise = new Promise<{ code: number | null }>(
    (resolve, reject) => {
      child.once('close', (code) => resolve({ code }));
      child.once('error', reject);
    },
  );

  const abortHandler = () => child.kill('SIGTERM');
  if (abortSignal?.aborted) {
    abortHandler();
  } else {
    abortSignal?.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    await stdoutPromise;
    const [stderr, exit] = await Promise.all([stderrPromise, exitPromise]);
    if (abortSignal?.aborted) {
      throw new Error('Knowledge base grep execution aborted');
    }
    if (exit.code && exit.code > 1) {
      throw new Error(stderr.trim() || 'grep command failed');
    }
  } finally {
    abortSignal?.removeEventListener('abort', abortHandler);
    rl.close();
  }

  return { entries, total, linesWereTruncatedInLength };
};

const joinOutput = (reminders: string[], content: string): string =>
  [...reminders, content].filter(Boolean).join('\n');

export const readKnowledgeBaseContent = async (
  content: string,
  options: ReadKnowledgeBaseContentOptions = {},
): Promise<string> => {
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    return '<system-reminder>Error: Offset must be a non-negative integer.</system-reminder>';
  }
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit <= 0)
  ) {
    return '<system-reminder>Error: Limit must be a positive integer.</system-reminder>';
  }
  const limit = Math.min(
    options.limit ?? DEFAULT_MAX_KNOWLEDGE_BASE_LINES,
    DEFAULT_MAX_KNOWLEDGE_BASE_LINES,
  );

  if (options.grep) {
    const result = await grepContent(
      content,
      parseGrepRequest(options.grep),
      offset,
      limit,
      options.abortSignal,
    );
    if (result.total === 0) return 'No matches found';
    if (offset >= result.total) {
      return `<system-reminder>Error: offset is out of range, offset: ${offset}, grepResultCount: ${result.total}.</system-reminder>`;
    }

    const reminders: string[] = [];
    const end = Math.min(offset + limit, result.total);
    if (offset > 0 || end < result.total) {
      reminders.push(
        `<system-reminder>Knowledge base grep results truncated: showing results ${offset + 1}-${end} of ${result.total}. Use offset/limit parameters to view more.</system-reminder>`,
      );
    }
    if (result.linesWereTruncatedInLength) {
      reminders.push(
        `<system-reminder>Knowledge base content partially truncated: some lines exceeded maximum length of ${MAX_KNOWLEDGE_BASE_LINE_LENGTH} characters.</system-reminder>`,
      );
    }
    return joinOutput(reminders, formatEntries(result.entries));
  }

  if (!content) {
    return '<system-reminder>Knowledge base item content is empty.</system-reminder>';
  }
  const lines = content.split(/\r?\n/);
  if (offset >= lines.length) {
    return `<system-reminder>Error: offset is out of range, offset: ${offset}, originalLineCount: ${lines.length}.</system-reminder>`;
  }
  const selected = lines.slice(offset, offset + limit);
  let linesWereTruncatedInLength = false;
  const entries = selected.map((line, index) => {
    const truncated = truncateLine(line);
    linesWereTruncatedInLength ||= truncated.truncated;
    return { lineNumber: offset + index + 1, text: truncated.value };
  });
  const end = Math.min(offset + limit, lines.length);
  const reminders: string[] = [];
  if (offset > 0 || end < lines.length) {
    reminders.push(
      `<system-reminder>Knowledge base item content truncated: showing lines ${offset + 1}-${end} of ${lines.length} total lines. Use offset/limit parameters to view more.</system-reminder>`,
    );
  }
  if (linesWereTruncatedInLength) {
    reminders.push(
      `<system-reminder>Knowledge base content partially truncated: some lines exceeded maximum length of ${MAX_KNOWLEDGE_BASE_LINE_LENGTH} characters.</system-reminder>`,
    );
  }
  return joinOutput(reminders, formatEntries(entries));
};
