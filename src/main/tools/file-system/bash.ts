import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { createShell, decodeBuffer, runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import os from 'os';
import stripAnsi from 'strip-ansi';
import { ChildProcessByStdio, spawn } from 'child_process';
import iconv from 'iconv-lite';
import Stream from 'stream';
const MAX_OUTPUT_LENGTH = 30000;

export class Bash extends BaseTool {
  id: string = 'Bash';
  description: string = `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

Before executing the command, please follow these steps:

1. Directory Verification:

- If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location
- For example, before running "mkdir foo/bar", first use LS to check that "foo" exists and is the intended parent directory

2. Command Execution:

- Always quote file paths that contain spaces with double quotes (e.g., cd "path with spaces/file.txt")
- Examples of proper quoting:
- cd "/Users/name/My Documents" (correct)
- cd /Users/name/My Documents (incorrect - will fail)
- python "/path/with spaces/script.py" (correct)
- python /path/with spaces/script.py (incorrect - will fail)
- After ensuring proper quoting, execute the command.
- Capture the output of the command.

Usage notes:

- The command argument is required.
- You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 120000ms (2 minutes).
- It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
- If the output exceeds 30000 characters, output will be truncated before being returned to you.
- You can use the \`run_in_background\` parameter to run the command in the background, which allows you to continue working while the command runs. You can monitor the output using the Bash tool as it becomes available. Never use \`run_in_background\` to run 'sleep' as it will return immediately. You do not need to use '&' at the end of the command when using this parameter.
- VERY IMPORTANT: You MUST avoid using search commands like \`find\` and \`grep\`. Instead use Grep, Glob, or Task to search. You MUST avoid read tools like \`cat\`, \`head\`, \`tail\`, and \`ls\`, and use Read and LS to read files.
- If you _still_ need to run \`grep\`, STOP. ALWAYS USE ripgrep at \`rg\` first, which all Claude Code users have pre-installed.
- When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
- Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of \`cd\`. You may use \`cd\` if the User explicitly requests it.
  <good-example>
  pytest /foo/bar/tests
  </good-example>
  <bad-example>
  cd /foo/bar && pytest tests
  </bad-example>

# Committing changes with git

When the user asks you to create a new git commit, follow these steps carefully:

1. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following bash commands in parallel, each using the Bash tool:

- Run a git status command to see all untracked files.
- Run a git diff command to see both staged and unstaged changes that will be committed.
- Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.

2. Analyze all staged changes (both previously staged and newly added) and draft a commit message:

- Summarize the nature of the changes (eg. new feature, enhancement to an existing feature, bug fix, refactoring, test, docs, etc.). Ensure the message accurately reflects the changes and their purpose (i.e. "add" means a wholly new feature, "update" means an enhancement to an existing feature, "fix" means a bug fix, etc.).
- Check for any sensitive information that shouldn't be committed
- Draft a concise (1-2 sentences) commit message that focuses on the "why" rather than the "what"
- Ensure it accurately reflects the changes and their purpose

3. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following commands in parallel:

- Add relevant untracked files to the staging area.
- Run git status to make sure the commit succeeded.

4. If the commit fails due to pre-commit hook changes, retry the commit ONCE to include these automated changes. If it fails again, it usually means a pre-commit hook is preventing the commit. If the commit succeeds but you notice that files were modified by the pre-commit hook, you MUST amend your commit to include them.

Important notes:

- NEVER update the git config
- NEVER run additional commands to read or explore code, besides git bash commands
- NEVER use the TodoWrite or Task tools
- DO NOT push to the remote repository unless the user explicitly asks you to do so
- IMPORTANT: Never use git commands with the -i flag (like git rebase -i or git add -i) since they require interactive input which is not supported.
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

1. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following bash commands in parallel using the Bash tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and \`git diff [base-branch]...HEAD\` to understand the full commit history for the current branch (from the time it diverged from the base branch)
2. Analyze all changes that will be included in the pull request, making sure to look at all relevant commits (NOT just the latest commit, but ALL commits that will be included in the pull request!!!), and draft a pull request summary
3. You have the capability to call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance. ALWAYS run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below. Use a HEREDOC to pass the body to ensure correct formatting.
     <example>
     gh pr create --title "the pr title" --body "$(cat <<'EOF'

## Summary

<1-3 bullet points>

## Test plan

[Checklist of TODOs for testing the pull request...]

EOF
)"
</example>

Important:

- NEVER update the git config
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when you're done, so the user can see it

# Other common operations

- View comments on a Github PR: gh api repos/foo/bar/pulls/123/comments`;

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
    timeout: z
      .number()
      .optional()
      .describe(`Optional timeout in milliseconds (max 600000)`),
    run_in_background: z
      .boolean()
      .optional()
      .describe(
        `Set to true to run this command in the background. Use BashOutput to read the output later.`,
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
    const { timeout, directory, run_in_background } = inputData;
    const { requestContext } = context;
    const threadId = requestContext.get('threadId' as never) as string;
    const abortSignal = context?.abortSignal;
    const isWindows = os.platform() === 'win32';

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

    if (run_in_background) {
      const shell_id = nanoid(8);
      bashManager.runInBackground(
        { command: inputData.command, description: inputData.description },
        shell_id,
        cwd,
        timeout,
        undefined,
        threadId,
      );
      return `Command running in background with ID: ${shell_id}`;
    }

    let exited = false;

    let {
      output,
      stdout,
      stderr,
      error,
      code,
      processSignal,
      backgroundPIDs,
      tempFilePath,
      pid,
    } = await runCommand(inputData.command, { cwd, timeout, abortSignal });
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

    const bashes = bashManager.getBashSessions(threadId).toArray();
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

export interface BashToolParams extends BaseToolkitParams {}

export class BashToolkit extends BaseToolkit {
  id: string = 'BashToolkit';

  constructor(params?: BashToolParams) {
    super(
      [new Bash(), new KillBash(), new BashOutput(), new ListBash()],
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
    timeout?: number,
    abortSignal?: AbortSignal,
    threadId?: string,
  ) {
    let abortController: AbortController;
    if (!abortSignal) {
      abortController = new AbortController();
      const signal = abortController.signal;
      abortSignal = signal;
    }
    const { shell, tempFilePath, command } = createShell(
      input.command,
      cwd,
      timeout,
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

      error.message = error.message.replace(command, input.command);
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
      console.log('exit', `${bashSession.bashId}`);
    };
    shell.on('exit', exitHandler);

    const abortHandler = async () => {
      console.log('abort', `${bashSession.bashId}`);
      if (shell.pid && !exited) {
        if (os.platform() === 'win32') {
          // For Windows, use taskkill to kill the process tree
          spawn('taskkill', ['/pid', shell.pid.toString(), '/f', '/t']);
        } else {
          try {
            // attempt to SIGTERM process group (negative PID)
            // fall back to SIGKILL (to group) after 200ms
            process.kill(-shell.pid, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (shell.pid && !exited) {
              process.kill(-shell.pid, 'SIGKILL');
            }
          } catch (_e) {
            // if group kill fails, fall back to killing just the main process
            try {
              if (shell.pid) {
                shell.kill('SIGKILL');
              }
            } catch (_e) {
              console.error(`failed to kill shell process ${shell.pid}: ${_e}`);
            }
          }
        }
      }
    };
    abortSignal?.addEventListener('abort', abortHandler);

    try {
      await new Promise((resolve) => shell.on('exit', resolve));
    } finally {
      abortSignal?.removeEventListener('abort', abortHandler);
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
    if (threadId)
      return this.bashMap
        .values()
        .filter((session) => session.threadId === threadId);

    return this.bashMap.values();
  }
}

const bashManager = new BashManager();
export default bashManager;
