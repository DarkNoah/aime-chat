import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import {
  attachAbortHandler,
  createManagedAbortController,
  createShell,
  decodeBuffer,
  runCommand,
} from '@/main/utils/shell';
import { getBunRuntime, getUVRuntime } from '@/main/app/runtime';
import { secretsManager } from '@/main/app/secrets';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import stripAnsi from 'strip-ansi';
import { ChildProcessByStdio } from 'child_process';
import iconv from 'iconv-lite';
import Stream from 'stream';
import { appManager } from '@/main/app';
import { ToolConfig } from '@/types/tool';
import { getRuntimePython } from '@/main/utils/runtimePython';
const MAX_OUTPUT_LENGTH = 10000;
// const PATH_DELIMITER = process.platform === 'win32' ? ';' : ':';

// function prependPath(env: Record<string, string>, dir?: string) {
//   if (!dir) return;
//   env['PATH'] += `${dir}${PATH_DELIMITER}`;
// }

// async function hasUsableSystemPython() {
//   const versionResult = await runCommand('python --version', {
//     timeout: 1000 * 5,
//   });
//   const versionOutput = `${versionResult.stdout}\n${versionResult.stderr}`;

//   if (
//     versionResult.code !== 0 ||
//     !/^Python\s+\d+(\.\d+)+/m.test(versionOutput)
//   ) {
//     return false;
//   }

//   if (process.platform !== 'win32') {
//     return true;
//   }

//   const whereResult = await runCommand('where python', {
//     timeout: 1000 * 5,
//   });
//   if (whereResult.code !== 0) {
//     return false;
//   }

//   const candidates = whereResult.stdout
//     .split('\n')
//     .map((line) => line.trim())
//     .filter(Boolean)
//     .map((line) => line.replace(/\//g, '\\').toLowerCase())
//     .filter((line) => !line.includes('\\windowsapps\\python.exe'));

//   return candidates.length > 0;
// }

// let hasSystemPython = undefined;

// export interface BashToolParams extends BaseToolParams {
//   env?: string;
// }

export class Bash extends BaseTool<BashToolParams> {
  static readonly toolName = 'Bash';
  id: string = 'Bash';
  description: string = `Executes a given bash command and returns its output.

The working directory persists between commands, but shell state does not. The shell environment is initialized from the user's profile (bash or zsh).

IMPORTANT: Avoid using this tool to run \`find\`, \`grep\`, \`cat\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, or \`echo\` commands, unless explicitly instructed or after you have verified that a dedicated tool cannot accomplish your task. Instead, use the appropriate dedicated tool as this will provide a much better experience for the user:
 - If you need set environment variables using the env argument (NOT \`export MY_CUSTOM_VAR=xxx\` in the command argument)
 - File search: Use Glob (NOT find or ls)
 - Content search: Use Grep (NOT grep or rg)
 - Read files: Use Read (NOT cat/head/tail)
 - Edit files: Use Edit (NOT sed/awk)
 - Write files: Use Write (NOT echo >/cat <<EOF)
 - Communication: Output text directly (NOT echo/printf)
While the Bash tool can do similar things, it’s better to use the built-in tools as they provide a better user experience and make it easier to review tool calls and give permission.

# Instructions
 - If your command will create new directories or files, first use this tool to run \`ls\` to verify the parent directory exists and is the correct location.
 - Always quote file paths that contain spaces with double quotes in your command (e.g., cd "path with spaces/file.txt")
 - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
 - You may specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). By default, your command will timeout after 120000ms (2 minutes).
 - You can use the \`run_in_background\` parameter to run the command in the background. Only use this if you don't need the result immediately and are OK being notified when the command completes later. You do not need to check the output right away - you'll be notified when it finishes. You do not need to use '&' at the end of the command when using this parameter.
 - Write a clear, concise description of what your command does. For simple commands, keep it brief (5-10 words). For complex commands (piped commands, obscure flags, or anything hard to understand at a glance), include enough context so that the user can understand what your command will do.
 - When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message. Example: if you need to run "git status" and "git diff", send a single message with two Bash tool calls in parallel.
  - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together.
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail.
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings).
 - For git commands:
  - Prefer to create a new commit rather than amending an existing commit.
  - Before running destructive operations (e.g., git reset --hard, git push --force, git checkout --), consider whether there is a safer alternative that achieves the same goal. Only use destructive operations when they are truly the best approach.
  - Never skip hooks (--no-verify) or bypass signing (--no-gpg-sign, -c commit.gpgsign=false) unless the user has explicitly asked for it. If a hook fails, investigate and fix the underlying issue.
 - Avoid unnecessary \`sleep\` commands:
  - Do not sleep between commands that can run immediately — just run them.
  - If your command is long running and you would like to be notified when it finishes – simply run your command using \`run_in_background\`. There is no need to sleep in this case.
  - Do not retry failing commands in a sleep loop — diagnose the root cause or consider an alternative approach.
  - If waiting for a background task you started with \`run_in_background\`, you will be notified when it completes — do not poll.
  - If you must poll an external process, use a check command (e.g. \`gh run view\`) rather than sleeping first.
  - If you must sleep, keep the duration short (1-5 seconds) to avoid blocking the user.


# Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive git commands (push --force, reset --hard, checkout ., restore ., clean -f, branch -D) unless the user explicitly requests these actions. Taking unauthorized destructive actions is unhelpful and can result in lost work, so it's best to ONLY run these commands when given direct instructions
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- CRITICAL: Always create NEW commits rather than amending, unless the user explicitly requests a git amend. When a pre-commit hook fails, the commit did NOT happen — so --amend would modify the PREVIOUS commit, which may result in destroying work or losing previous changes. Instead, after hook failure, fix the issue, re-stage, and create a NEW commit
- When staging files, prefer adding specific files by name rather than using "git add -A" or "git add .", which can accidentally include sensitive files (.env, credentials) or large binaries
- NEVER commit changes unless the user explicitly asks you to. It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel, each using the Bash tool:
  - Run a git status command to see all untracked files. IMPORTANT: Never use the -uall flag as it can cause memory issues on large repos.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:
  - Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
  - Do not commit files that likely contain secrets (.env, credentials.json, etc). Warn the user if they specifically request to commit those files
  - Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
  - Ensure it accurately reflects the changes and their purpose
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands:
   - Add relevant untracked files to the staging area.
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
4. If the commit fails due to pre-commit hook: fix the issue and create a NEW commit

Important notes:
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the TodoWrite or Agent tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
- IMPORTANT: Do not use --no-edit with git rebase commands, as the --no-edit flag is not a valid option for git rebase.
- If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit
- In order to ensure good formatting, ALWAYS pass the commit message via a HEREDOC, a la this example:
<example>
git commit -m "$(cat <<'EOF'
   Commit message here.
   EOF
   )"
</example>

# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks including working with issues, pull requests, checks, and releases. If given a Github URL use the gh command to get the information needed.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel using the Bash tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files (never use -uall flag)
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff[base - branch]...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request title and summary:
   - Keep the PR title short (under 70 characters)
   - Use the description/body for details, not the title
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
<example>
gh pr create --title "the pr title" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Test plan
[Bulleted markdown checklist of TODOs for testing the pull request...]

EOF
)"
</example>

Important:
- DO NOT use the TodoWrite or Agent tools
- Return the PR URL when you're done, so the user can see it

# Other common operations
- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments
`;

  inputSchema = z.object({
    description: z.string().optional()
      .describe(`Clear, concise description of what this command does in 5-10 words. Examples:
Input: ls
Output: Lists files in current directory

Input: git status
Output: Shows working tree status

Input: npm install
Output: Installs package dependencies

Input: mkdir foo
Output: Creates directory 'foo'`),
    command: z.string().describe(`The command to execute`),
    directory: z
      .string()
      .optional()
      .describe('The directory to run the command in (must be absolute path)'),
    // env: z
    //   .record(z.string(), z.string())
    //   .optional()
    //   .describe('Optional the environment variables to set'),
    timeout: z
      .number()
      .optional()
      .describe(`Optional timeout in milliseconds (max 600000)`),
    env: z.record(z.string(), z.string()).optional().describe('Optional the environment variables'),
    run_in_background: z
      .boolean()
      .optional()
      .describe(
        `Set to true to run this command in the background. Use BashOutput to read the output later.`,
      ),
  });
  outputSchema = z.string();
  configSchema = ToolConfig.Bash.configSchema;
  env?: string;

  constructor(config?: BashToolParams) {
    super(config);
    this.env = config?.env;
  }
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { timeout, directory, run_in_background, env } = inputData;
    const { requestContext } = context;
    const threadId = requestContext.get('threadId' as never) as string;
    const abortSignal = context?.abortSignal;

    if (directory && !fs.existsSync(directory)) {
      throw new Error(`Directory ${directory} does not exist`);
    }
    let cwd;
    if (directory) {
      if (path.isAbsolute(directory)) {
        cwd = directory;
      } else {
        cwd = path.join(
          requestContext.get('workspace' as never) as string,
          directory,
        );
      }
    } else {
      cwd = requestContext.get('workspace' as never) as string;
    }
    if (cwd && fs.existsSync(cwd) && !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Directory ${cwd} is not a directory`);
    }
    let _env = {};
    _env['PATH'] = '';
    if (this.env) {
      this.env.split('\n').map(x => x.trim()).filter(x => x).forEach(x => {
        const [key, value] = x.split('=');
        _env[key.trim()] = value.trim();
      });
    }

    // const uv = await getUVRuntime();
    // const bun = await getBunRuntime();

    // if (uv?.installed || bun?.installed) {
    //   prependPath(_env, uv.dir || bun.dir);
    // }

    // const _hasSystemPython = hasSystemPython !== undefined ? hasSystemPython : await hasUsableSystemPython();
    // hasSystemPython = _hasSystemPython;
    // const runtimePythonBinDir = uv.pythonRuntime?.pythonPath
    //   ? path.dirname(uv.pythonRuntime.pythonPath)
    //   : undefined;

    // if (!hasSystemPython && runtimePythonBinDir) {
    //   prependPath(_env, runtimePythonBinDir);
    // }
    _env = await getRuntimePython(_env);

    const secretsEnv = await secretsManager.getSecretsEnv();
    _env = { ..._env, ...secretsEnv };

    if (env && Object.values(env).length > 0) {
      _env = {
        ..._env,
        ...env,
      };
    }

    if (run_in_background) {
      const shell_id = nanoid(8);
      bashManager.runInBackground(
        { command: inputData.command, description: inputData.description },
        shell_id,
        cwd,
        _env,
        undefined,
        undefined,
        threadId,
      );
      return `Command running in background with ID: ${shell_id}, You can use BashOutput to check its output whenever you need to see what's happening.`;
    }

    let exited = false;

    // if (runtimeInfo.bun.installed) {
    //   env['PATH'] +=
    //     `${runtimeInfo.bun.dir}` + (process.platform === 'win32' ? ';' : ':');
    // }

    let {
      output,
      stdout,
      stderr,
      error,
      code,
      processSignal,
      timedOut,
      backgroundPIDs,
      tempFilePath,
      pid,
    } = await runCommand(inputData.command, {
      cwd,
      timeout,
      abortSignal,
      env: _env,
    });
    console.log(tempFilePath, inputData.command);
    let llmContent = '';
    if (abortSignal?.aborted) {
      llmContent = 'Command was cancelled by user before it could complete.';
      if (output.trim()) {
        output = output.trim();

        if (output && output.length > MAX_OUTPUT_LENGTH) {
          output = truncateText(output, MAX_OUTPUT_LENGTH / 2);
        }
        llmContent += ` Below is the output (on stdout and stderr) before it was cancelled:\n${output}`;
      } else {
        llmContent += ' There was no output before it was cancelled.';
      }
    } else if (timedOut) {
      llmContent = `Command timed out after ${timeout}ms before it could complete.`;
      if (output.trim()) {
        output = output.trim();

        if (output && output.length > MAX_OUTPUT_LENGTH) {
          output = truncateText(output, MAX_OUTPUT_LENGTH / 2);
        }
        llmContent += ` Below is the output (on stdout and stderr) before timeout:\n${output}`;
      } else {
        llmContent += ' There was no output before timeout.';
      }
    } else {
      if (stdout && stdout.length > MAX_OUTPUT_LENGTH) {
        stdout = truncateText(stdout, 1000);
      }
      let errorMessage = error?.toString();
      if (errorMessage && errorMessage.length > MAX_OUTPUT_LENGTH) {
        errorMessage = truncateText(errorMessage, 1000);
      }
      llmContent = [
        `Command: ${inputData.command}`,
        `Directory: ${cwd}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${errorMessage ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
        // `Background PIDs: ${
        //   backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'
        // }`,
        `Process Group PGID: ${pid ?? '(none)'}`,
      ].join('\n');
    }

    return llmContent;
  };
}

export class BashOutput extends BaseTool {
  static readonly toolName = 'BashOutput';
  id: string = 'BashOutput';
  description: string = `- Retrieves output from a running or completed background bash shell
- Takes a shell_id parameter identifying the shell
- Always returns only new output since the last check
- Returns stdout and stderr output along with shell status
- Supports optional regex filtering to show only lines matching a pattern
- Use this tool when you need to monitor or check the output of a long-running shell
- Shell IDs can be found using the ListBash tool`;

  inputSchema = z.object({
    shell_id: z
      .string()
      .describe('The ID of the background shell to retrieve output from'),
    filter: z
      .string()
      .optional()
      .describe(
        'Optional regular expression to filter the output lines. Only lines matching this regex will be included in the result. Any lines that do not match will no longer be available to read.',
      ),
  });
  outputSchema = z.string();

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { shell_id, filter } = inputData;

    const bashSession = bashManager.getBackgroundBashSession(shell_id);

    if (!bashSession) {
      return `Bash session not found, shell_id: ${shell_id}`;
    }
    let stdouts = bashSession.stdout.map((item) => item.content);
    let stderrs = bashSession.stderr.map((item) => item.content);
    let stdout = stdouts.join('\n');
    let stderr = stderrs.join('\n');

    if (filter) {
      stdout = stdouts
        .filter((item) => item.match(new RegExp(filter)))
        .join('\n');
      stderr = stderrs
        .filter((item) => item.match(new RegExp(filter)))
        .join('\n');
    }

    if (stdout && stdout.length > MAX_OUTPUT_LENGTH) {
      stdout = truncateText(stdout, 1000);
    }
    let errorMessage = bashSession.errorMessage;
    if (errorMessage && errorMessage.length > MAX_OUTPUT_LENGTH) {
      errorMessage = truncateText(errorMessage, 1000);
    }

    const llmContent = [
      `Command: ${bashSession.command}`,
      `Directory: ${bashSession.directory || '(root)'}`,
      `Stdout: ${stdout || '(empty)'}`,
      `Stderr: ${stderr || '(empty)'}`,
      `Error: ${errorMessage ?? '(none)'}`,
      `Exit Code: ${bashSession.exitCode ?? '(none)'}`,
      `Signal: ${bashSession.processSignal ?? '(none)'}`,
      `Timed Out: ${bashSession.timedOut ? 'Yes' : 'No'}`,
      `Duration: ${Math.floor(
        (new Date().getTime() - bashSession.startTime.getTime()) / 1000,
      )} s`,
      `IsRunning: ${bashSession.isExited ? 'No' : 'Yes'}`,
      `Process Group PGID: ${bashSession.pid ?? '(none)'}`,
    ].join('\n');

    return llmContent;
  };
}

export class KillBash extends BaseTool {
  static readonly toolName = 'KillBash';
  id: string = 'KillBash';
  description: string = `- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the ListBash tool`;

  inputSchema = z.object({
    shell_id: z.string().describe('The ID of the background shell to kill'),
  });
  outputSchema = z.string();

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { shell_id } = inputData;
    const bashSession = await bashManager.remove(shell_id);
    if (bashSession) {
      let stdout = bashSession.stdout.map((item) => item.content).join('\n');
      let stderr = bashSession.stderr.map((item) => item.content).join('\n');

      return [
        `Successfully killed shell: ${shell_id} (${bashSession.command}).`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${bashSession.errorMessage ?? '(none)'}`,
        `Duration: ${Math.floor(
          (new Date().getTime() - bashSession.startTime.getTime()) / 1000,
        )} s`,
      ].join('\n');
    }
    return `Bash session ${shell_id} not found`;
  };
}

export class ListBash extends BaseTool {
  static readonly toolName = 'ListBash';
  id: string = 'ListBash';
  description: string = `- Use this tool found all running background bash shells`;

  inputSchema = z.strictObject({});
  outputSchema = z.string();

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { requestContext } = context;
    const threadId = requestContext.get('threadId' as never) as string;

    const bashes = bashManager.getBashSessions(threadId);
    return bashes.length == 0
      ? `No running bash sessions found`
      : bashes
        .map(
          (x) =>
            `Shell ID: ${x.bashId}
Command: ${x.command}
Description: ${x.description ?? '(no description)'}
IsRunning: ${x.isExited ? 'No' : 'Yes'}`,
        )
        .join('\n\n---\n\n');
  };
}

export interface BashToolParams extends BaseToolkitParams {
  env?: string;
}

export class BashToolkit extends BaseToolkit {
  static readonly toolName = 'BashToolkit';
  id: string = 'BashToolkit';




  constructor(params?: BashToolParams) {
    super(
      [new Bash(params?.[Bash.toolName] ?? {}), new KillBash(), new BashOutput(), new ListBash()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}

export interface BashSession {
  shell: ChildProcessByStdio<null, Stream.Readable, Stream.Readable>;
  threadId?: string;
  bashId: string;
  command: string;
  directory: string;
  stdout: {
    content: string;
    timestamp: Date;
  }[];
  stderr: {
    content: string;
    timestamp: Date;
  }[];
  startTime: Date;
  errorMessage?: string;
  isExited: boolean;
  exitCode?: number;
  pid: number;
  lastGetOutputTime?: Date;
  abortController?: AbortController;
  processSignal?: NodeJS.Signals;
  description?: string;
  timedOut?: boolean;
}

export class BashManager {
  private bashMap: Map<string, BashSession> = new Map();

  async runInBackground(
    input: {
      command: string;
      description?: string;
    },
    bashId?: string,
    cwd?: string,
    env?: Record<string, string>,
    timeout?: number,
    abortSignal?: AbortSignal,
    threadId?: string,
  ) {
    const managedAbort = createManagedAbortController(timeout, abortSignal);
    const { abortController } = managedAbort;
    const { shell, tempFilePath, command } = await createShell(
      input.command,
      cwd,
      undefined,
      env,
    );
    if (!bashId) {
      bashId = nanoid(8);
    }
    const bashSession: BashSession = {
      shell,
      bashId,
      command: input.command,
      directory: cwd,
      stdout: [],
      stderr: [],
      startTime: new Date(),
      errorMessage: undefined,
      isExited: false,
      exitCode: undefined,
      pid: shell.pid,
      lastGetOutputTime: new Date(),
      abortController,
      threadId,
      description: input.description,
      timedOut: false,
    };
    this.bashMap.set(bashId, bashSession);

    let exited = false;
    let stdout = '';
    let output = '';
    let lastUpdateTime = Date.now();

    const appendOutput = (str: string) => {
      output += str;
    };

    shell.stdout.on('data', (data: Buffer) => {
      // continue to consume post-exit for background processes
      // removing listeners can overflow OS buffer and block subprocesses
      // destroying (e.g. shell.stdout.destroy()) can terminate subprocesses via SIGPIPE
      if (!exited) {
        const text = decodeBuffer(data);
        const str = stripAnsi(text);
        stdout += str;
        bashSession.stdout.push({
          content: str,
          timestamp: new Date(),
        });
        appendOutput(str);
      }
    });

    let stderr = '';
    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        const text = decodeBuffer(data);
        const str = stripAnsi(text);
        stderr += str;
        bashSession.stderr.push({
          content: str,
          timestamp: new Date(),
        });
        appendOutput(str);
      }
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
      // remove wrapper from user's command in error message

      const wrappedCommand = Array.isArray(command) ? command.join(' ') : command;
      error.message = error.message.replace(wrappedCommand, input.command);
      bashSession.errorMessage = error.message;
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const exitHandler = (
      _code: number | null,
      _signal: NodeJS.Signals | null,
    ) => {
      exited = true;
      code = _code;
      processSignal = _signal;
      bashSession.exitCode = _code;
      bashSession.isExited = true;
      bashSession.processSignal = _signal;
      bashSession.timedOut = managedAbort.didTimeout();
      console.log('exit', `${bashSession.bashId}`);
    };
    shell.on('exit', exitHandler);
    const removeAbortHandler = attachAbortHandler(
      shell,
      managedAbort.abortSignal,
      () => exited,
    );

    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      removeAbortHandler();
      managedAbort.cleanup();
    }
  }

  hasUpdate(bash_id: string) {
    const bashSession = this.bashMap.get(bash_id);
    if (!bashSession) {
      console.error(`bash session ${bash_id} not found`);
      return false;
    }

    const stdout = bashSession.stdout.filter(
      (item) => item.timestamp > bashSession.lastGetOutputTime,
    );
    const stderr = bashSession.stderr.filter(
      (item) => item.timestamp > bashSession.lastGetOutputTime,
    );

    if (
      bashSession.lastGetOutputTime < new Date() &&
      (stdout.length > 0 || stderr.length > 0 || bashSession.isExited)
    ) {
      return true;
    }
    return false;
  }

  get(bash_id: string): BashSession | null {
    const bashSession = this.bashMap.get(bash_id);
    if (!bashSession) {
      console.error(`bash session ${bash_id} not found`);
      return null;
    }
    return bashSession;
  }

  getBackgroundBashSession(bash_id: string) {
    const bashSession = this.bashMap.get(bash_id);
    if (!bashSession) {
      console.error(`bash session ${bash_id} not found`);
      return null;
    }
    const lastGetOutputTime = bashSession.lastGetOutputTime;
    if (lastGetOutputTime) {
      bashSession.stdout = bashSession.stdout.filter(
        (item) => item.timestamp > lastGetOutputTime,
      );
      bashSession.stderr = bashSession.stderr.filter(
        (item) => item.timestamp > lastGetOutputTime,
      );
    }
    if (bashSession.isExited) {
      this.remove(bash_id);
    }
    bashSession.lastGetOutputTime = new Date();
    return bashSession;
  }

  kill(bash_id: string) {
    const bashSession = this.bashMap.get(bash_id);
    if (!bashSession) {
      console.error(`bash session ${bash_id} not found`);
      return;
    }
    if (!bashSession.isExited) {
      try {
        bashSession.abortController?.abort();
      } catch (error) {
        console.error(`failed to kill shell process ${bash_id}: ${error}`);
      }
    }
  }

  async remove(bash_id: string) {
    let bashSession = this.bashMap.get(bash_id);
    if (!bashSession) {
      console.error(`bash session ${bash_id} not found`);
      return;
    }
    if (!bashSession.isExited) {
      this.kill(bash_id);
    }

    while (!bashSession.isExited) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    bashSession = this.bashMap.get(bash_id);
    if (bashSession.lastGetOutputTime) {
      bashSession.stdout = bashSession.stdout.filter(
        (item) => item.timestamp > bashSession.lastGetOutputTime,
      );
      bashSession.stderr = bashSession.stderr.filter(
        (item) => item.timestamp > bashSession.lastGetOutputTime,
      );
    }
    this.bashMap.delete(bash_id);
    return bashSession;
  }

  removeNotExsited(bash_ids: string[]) {
    const new_bash_ids: string[] = [];
    for (const bash_id of bash_ids) {
      if (this.bashMap.has(bash_id)) {
        new_bash_ids.push(bash_id);
      } else {
        this.bashMap.delete(bash_id);
      }
    }
    return new_bash_ids;
  }

  getBashSessions(threadId?: string) {
    const sessions = Array.from(this.bashMap.values());
    if (threadId) {
      return sessions.filter((session) => session.threadId === threadId);
    }
    return sessions;
  }
}

const bashManager = new BashManager();
export default bashManager;
