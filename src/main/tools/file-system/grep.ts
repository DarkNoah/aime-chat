import { ToolExecutionContext } from '@mastra/core/tools';
import BaseTool from '../base-tool';
import z from 'zod';
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import readline from 'readline';
import pathUtil from 'path';
import fs from 'fs';

const MAX_LINE_LENGTH_TEXT_FILE = 2000;
export class Grep extends BaseTool {
  id: string = 'Grep';
  description: string = `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true`;
  inputSchema = z
    .object({
      pattern: z
        .string()
        .describe(
          'The regular expression pattern to search for in file contents',
        ),

      path: z
        .string()
        .optional()
        .describe(
          'File or directory to search in (rg PATH). Defaults to current working directory.',
        ),

      glob: z
        .string()
        .optional()
        .describe(
          'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
        ),

      output_mode: z
        .enum(['content', 'files_with_matches', 'count'])
        .optional()
        .describe(
          'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
        ),

      '-B': z
        .number()
        .optional()
        .describe(
          'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.',
        ),

      '-A': z
        .number()
        .optional()
        .describe(
          'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.',
        ),

      '-C': z
        .number()
        .optional()
        .describe(
          'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.',
        ),

      '-n': z
        .boolean()
        .optional()
        .describe(
          'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise.',
        ),

      '-i': z.boolean().optional().describe('Case insensitive search (rg -i)'),

      type: z
        .string()
        .optional()
        .describe(
          'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.',
        ),

      head_limit: z
        .number()
        .optional()
        .describe(
          'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). When unspecified, shows all results from ripgrep.',
        ),
      offset: z
        .number()
        .optional()
        .describe(
          'Skip first N lines/entries before applying head_limit, equivalent to \"| tail -n +N | head -N\". Works across all output modes. Defaults to 0.',
        ),
      multiline: z
        .boolean()
        .optional()
        .describe(
          'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
        ),
    })
    .strict();
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const {
      pattern,
      path,
      glob,
      output_mode,
      '-B': B,
      '-A': A,
      '-C': C,
      '-n': n,
      '-i': i,
      type,
      head_limit,
      offset,
      multiline,
    } = inputData;
    const { abortSignal, requestContext } = context;

    let cwd;
    if (path) {
      if (pathUtil.isAbsolute(path)) {
        cwd = path;
      } else {
        cwd = pathUtil.join(
          requestContext.get('workspace' as never) as string,
          path,
        );
      }
    } else {
      cwd = requestContext.get('workspace' as never) as string;
    }

    if (cwd && fs.existsSync(cwd) && !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Directory ${cwd} is not a directory`);
    }

    const args: string[] = [];

    // 2. 构建命令行参数

    // 处理 output_mode
    const mode = output_mode || 'files_with_matches';
    if (mode === 'files_with_matches') {
      args.push('--files-with-matches'); // -l
    } else if (mode === 'count') {
      args.push('--count'); // -c
    }
    if (glob !== undefined) args.push('--glob', glob);
    // mode === 'content' 是默认行为，不需要特殊 flag，但后续参数依赖它

    // 处理 Context 相关参数 (仅在 content 模式下生效)
    if (mode === 'content') {
      if (n) args.push('-n');
      if (C !== undefined) args.push('-C', C.toString());
      if (A !== undefined) args.push('-A', A.toString());
      if (B !== undefined) args.push('-B', B.toString());
    }

    // 处理通用参数
    if (i) args.push('-i');
    if (type) args.push('--type', type);
    args.push('--hidden');
    args.push('--sort-files');

    if (multiline) {
      args.push('--multiline', '--multiline-dotall');
    }

    args.push('-e', pattern);

    if (cwd) {
      args.push(cwd);
    }

    const child = spawn(rgPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let outputLines: string[] = [];
    let collectedCount = 0;
    let totalCount = 0;
    const limit =
      head_limit !== undefined && head_limit >= 0 ? head_limit : undefined;
    const skip = offset !== undefined && offset > 0 ? offset : 0;

    // 使用 readline 逐行读取 stdout
    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    const exitPromise = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('close', (code, signal) => resolve({ code, signal }));
      child.once('error', reject);
    });

    const stdoutPromise = (async () => {
      try {
        for await (const line of rl) {
          totalCount++;

          if (skip && totalCount <= skip) {
            continue;
          }

          outputLines.push(line);
          collectedCount++;

          // 如果设置了 head_limit 且达到限制，提前终止
          if (limit !== undefined && collectedCount >= limit) {
            rl.close();
            child.kill('SIGTERM'); // 杀掉 rg 进程
            break; // 退出循环
          }
        }
      } catch {
        // 忽略流中断错误
      } finally {
        rl.close();
      }
    })();

    const stderrPromise = (async () => {
      if (!child.stderr) return '';
      let stderr = '';
      try {
        for await (const chunk of child.stderr) {
          stderr += chunk;
        }
      } catch {
        // 忽略流中断错误
      }
      return stderr;
    })();

    const abortHandler = () => {
      rl.close();
      child.kill('SIGTERM');
    };
    let abortHandlerAttached = false;
    if (abortSignal) {
      if (abortSignal.aborted) {
        abortHandler();
      } else {
        abortSignal.addEventListener('abort', abortHandler);
        abortHandlerAttached = true;
      }
    }

    await stdoutPromise;
    const [stderr, exitResult] = await Promise.all([
      stderrPromise,
      exitPromise,
    ]);

    if (abortHandlerAttached && abortSignal) {
      abortSignal.removeEventListener('abort', abortHandler);
    }

    if (abortSignal?.aborted) {
      throw new Error('Grep execution aborted');
    }

    if (exitResult.code && exitResult.code > 1) {
      const message = stderr.trim() || 'ripgrep command failed';
      throw new Error(message);
    }

    let linesWereTruncatedInLength = false;
    outputLines = outputLines.map((x) => {
      if (x.length > MAX_LINE_LENGTH_TEXT_FILE) {
        linesWereTruncatedInLength = true;
        return x.substring(0, MAX_LINE_LENGTH_TEXT_FILE) + '... [truncated]';
      }
      return x;
    });

    let baseOutput = '';
    if (linesWereTruncatedInLength) {
      baseOutput += `<system-reminder>Content partially truncated: some lines exceeded maximum length of ${MAX_LINE_LENGTH_TEXT_FILE} characters.</system-reminder>\n`;
    }
    baseOutput +=
      outputLines.length > 0 ? outputLines.join('\n') : 'No matches found';

    const shouldPaginate = limit !== undefined || skip > 0;
    if (!shouldPaginate) {
      return baseOutput;
    }

    const limitLabel = limit !== undefined ? limit.toString() : '∞';
    return `${baseOutput}\n\n[Showing results with pagination = limit: ${limitLabel}, offset: ${skip}]`;
  };
}
