import { spawn } from 'node:child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import stripAnsi from 'strip-ansi';
import fixPath from 'fix-path';
import { appManager } from '../app';
import iconv from 'iconv-lite';
import { isString } from '@/utils/is';
import { parse, quote } from 'shell-quote';

export const decodeBuffer = (data: Buffer) => {
  return process.platform === 'win32'
    ? iconv.decode(data, 'cp936')
    : data.toString('utf8');
};

export const runCommand = async (
  command: string | string[],
  options?: {
    file?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
    onStdOut?: (str: string) => void;
    onStdErr?: (str: string) => void;
    usePowerShell?: boolean;
  },
) => {
  const {
    shell,
    tempFilePath,
    command: realCommand,
  } = createShell(
    command,
    options?.cwd,
    options?.timeout,
    options?.env,
    options?.usePowerShell,
    options?.file
  );
  let exited = false;
  let stdout = '';
  let output = '';
  const lastUpdateTime = Date.now();

  const appendOutput = (str: string) => {
    output += str;
    console.log(str);
  };
  console.log('Start run command: ' + realCommand);

  shell.stdout.on('data', (data: Buffer) => {
    // continue to consume post-exit for background processes
    // removing listeners can overflow OS buffer and block subprocesses
    // destroying (e.g. shell.stdout.destroy()) can terminate subprocesses via SIGPIPE
    if (!exited) {
      const text = decodeBuffer(data);
      const str = stripAnsi(text);
      stdout += str;
      options?.onStdOut?.(str);
      appendOutput(str);
    }
  });

  let stderr = '';
  shell.stderr.on('data', (data: Buffer) => {
    if (!exited) {
      const text = decodeBuffer(data);
      const str = stripAnsi(text);
      stderr += str;
      options?.onStdErr?.(str);
      appendOutput(str);
    }
  });

  let error: Error | null = null;
  shell.on('error', (err: Error) => {
    error = err;
    // remove wrapper from user's command in error message
    error.message = error.message.replace(realCommand, command);
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
  };
  shell.on('exit', exitHandler);

  const abortHandler = async () => {
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
  options?.abortSignal?.addEventListener('abort', abortHandler);

  // wait for the shell to exit
  try {
    await new Promise((resolve) => shell.on('exit', resolve));
  } finally {
    options?.abortSignal?.removeEventListener('abort', abortHandler);
  }

  const backgroundPIDs: number[] = [];
  if (os.platform() !== 'win32') {
    if (fs.existsSync(tempFilePath)) {
      const pgrepLines = fs
        .readFileSync(tempFilePath, 'utf8')
        .split('\n')
        .filter(Boolean);
      for (const line of pgrepLines) {
        if (!/^\d+$/.test(line)) {
          console.error(`pgrep: ${line}`);
        }
        const pid = Number(line);
        // exclude the shell subprocess pid
        if (pid !== shell.pid) {
          backgroundPIDs.push(pid);
        }
      }
      fs.unlinkSync(tempFilePath);
    } else {
      if (options?.abortSignal?.aborted === false) {
        console.error('missing pgrep output');
      }
    }
  }
  return {
    output,
    stdout,
    stderr,
    error,
    code,
    processSignal,
    backgroundPIDs,
    tempFilePath,
    pid: shell.pid,
  };
};

export const createShell = (
  input_command: string | string[],
  cwd?: string,
  timeout?: number,
  env?: Record<string, string>,
  usePowerShell: boolean = false,
  file :string = null
) => {
  const isWindows = os.platform() === 'win32';

  const tempFileName = `shell_pgrep_${crypto
    .randomBytes(6)
    .toString('hex')}.tmp`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  fixPath();
  let _env = {
    ...process.env,
    PATH: process.env.PATH,
    HOME: os.homedir(),
  };

  if (appManager.appProxy?.host && appManager.appProxy?.port) {
    _env['HTTP_PROXY'] =
      `http://${appManager.appProxy.host}:${appManager.appProxy.port}`;
    _env['HTTPS_PROXY'] =
      `http://${appManager.appProxy.host}:${appManager.appProxy.port}`;
  }

  if (env) {
    _env = {
      ..._env,
      ...env,
    };
  }

  // pgrep is not available on Windows, so we can't get background PIDs
  const _command = isWindows
    ? input_command
    : (() => {
        // wrap command to append subprocess pids (via pgrep) to temporary file
        let command = isString(input_command)
          ? input_command
          : quote(input_command);
        if (!command.endsWith('&')) command += ';';
        return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
      })();

  if (isWindows && usePowerShell) {
    const command = isString(input_command)
      ? (parse(input_command) as string[])
      : input_command;
    return {
      shell: spawn('powershell.exe', command, {
        stdio: ['ignore', 'pipe', 'pipe'],
        // detached: true, // ensure subprocess starts its own process group (esp. in Linux)
        cwd: cwd,
        timeout: timeout,
        env: _env,
      }),
      tempFilePath,
      command: _command,
    };
  }

  if (!isWindows) {
    const shell = spawn(file || 'bash', file ? [_command as string]: ['-c', _command as string], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // ensure subprocess starts its own process group (esp. in Linux)
      cwd: cwd,
      timeout: timeout,
      env: _env,
    });
    return { shell, tempFilePath, command: _command };
  } else {
    let real_input_command: string[];
    if (isString(_command)) {
      real_input_command = parse(_command) as string[];
    } else {
      real_input_command = _command;
    }

    real_input_command = real_input_command.map((x) => {
      if (isString(x)) {
        return x;
      } else {
        if ('op' in x) {
          return x['op'];
        } else {
          return '';
        }
      }
    });
    const shell = spawn(file || 'cmd.exe', file ? [...real_input_command] : ['/c', ...real_input_command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // detached: true, // ensure subprocess starts its own process group (esp. in Linux)
      cwd: cwd,
      timeout: timeout,
      env: _env,
    });
    return { shell, tempFilePath, command: _command };
  }
};
