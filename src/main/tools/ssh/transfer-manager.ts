/* eslint-disable import/no-cycle */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Terminal } from '@xterm/headless';
import fixPath from 'fix-path';
import type { IDisposable, IPty } from 'node-pty';
import { spawn as spawnPty } from 'node-pty';
import stripAnsi from 'strip-ansi';
import {
  getDefaultSSHConfigPath,
  normalizeSSHTarget,
  type SSHTarget,
} from './manager';

const TERMINAL_COLS = 120;
const TERMINAL_ROWS = 20;
const AUTH_PROMPT_PATTERN =
  /(?:password|enter passphrase(?: for (?:key )?.*)?|passphrase):\s*$/im;
const HOST_CONFIRMATION_PATTERN =
  /are you sure you want to continue connecting\s*\(yes\/no(?:\/\[fingerprint\])?\)\?/i;

export type SSHTransferDirection = 'upload' | 'download';
export type SSHTransferState = 'exited' | 'error';

export type SSHTransferOutput = {
  connection_id: string;
  target: SSHTarget;
  direction: SSHTransferDirection;
  local_path: string;
  remote_path: string;
  state: SSHTransferState;
  screen: string;
  cursor: {
    row: number;
    column: number;
  };
  exit_code?: number;
  signal?: number;
  error?: string;
};

export type SSHTransferLaunchSpec = {
  executable: string;
  args: string[];
  target: SSHTarget;
  direction: SSHTransferDirection;
  localPath: string;
  remotePath: string;
};

type ActiveTransfer = {
  pty: IPty;
  terminal: Terminal;
  dataSubscription?: IDisposable;
  exitSubscription?: IDisposable;
  disposed: boolean;
};

const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const isExecutable = (filePath: string, platform = process.platform) => {
  try {
    fs.accessSync(
      filePath,
      platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
};

const findExecutableOnPath = (
  executable: string,
  env: Record<string, string | undefined>,
  platform = process.platform,
) => {
  const pathValue = env.PATH ?? env.Path ?? env.path ?? '';
  const pathApi = platform === 'win32' ? path.win32 : path;
  const delimiter = platform === 'win32' ? ';' : path.delimiter;
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = pathApi.join(directory.replace(/^"|"$/g, ''), executable);
    if (isExecutable(candidate, platform)) return candidate;
  }
  return undefined;
};

export const getWindowsOpenSCPPath = (windowsDirectory: string) =>
  path.win32.join(windowsDirectory, 'System32', 'OpenSSH', 'scp.exe');

export const resolveSCPExecutable = (
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) => {
  if (platform !== 'win32') fixPath();

  if (platform === 'win32') {
    const windowsDirectory = env.WINDIR ?? env.SystemRoot;
    if (windowsDirectory) {
      const systemSCP = getWindowsOpenSCPPath(windowsDirectory);
      if (isExecutable(systemSCP, platform)) return systemSCP;
    }
    const executable = findExecutableOnPath('scp.exe', env, platform);
    if (executable) return executable;
  } else {
    const executable = findExecutableOnPath('scp', env, platform);
    if (executable) return executable;
  }

  throw new Error(
    platform === 'win32'
      ? 'OpenSSH scp.exe was not found. Install the Windows OpenSSH Client or add scp.exe to PATH.'
      : 'OpenSSH scp was not found. Install scp or add it to PATH.',
  );
};

export const resolveTransferLocalPath = (
  value: string,
  options: {
    platform?: typeof process.platform;
    homeDirectory?: string;
    cwd?: string;
  } = {},
) => {
  if (!value || hasControlCharacters(value)) {
    throw new Error('Local transfer path is invalid');
  }
  const platform = options.platform ?? process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path;
  const homeDirectory = options.homeDirectory ?? os.homedir();
  let expanded = value;
  if (value === '~') {
    expanded = homeDirectory;
  } else if (value.startsWith('~/') || value.startsWith('~\\')) {
    expanded = pathApi.join(homeDirectory, value.slice(2));
  }
  return pathApi.resolve(options.cwd ?? process.cwd(), expanded);
};

const getRemoteSpec = (target: SSHTarget, remotePath: string) => {
  if (target.type === 'config') return `${target.name}:${remotePath}`;
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${target.username ? `${target.username}@` : ''}${host}:${remotePath}`;
};

export const buildSCPLaunchSpec = (options: {
  target: SSHTarget;
  direction: SSHTransferDirection;
  localPath: string;
  remotePath: string;
  recursive?: boolean;
  executable?: string;
  configPath?: string;
  platform?: typeof process.platform;
  homeDirectory?: string;
  cwd?: string;
}): SSHTransferLaunchSpec => {
  const platform = options.platform ?? process.platform;
  const homeDirectory = options.homeDirectory ?? os.homedir();
  const target = normalizeSSHTarget(options.target);
  const configPath =
    options.configPath ?? getDefaultSSHConfigPath(homeDirectory, platform);
  const configExists = fs.existsSync(configPath);
  if (target.type === 'config' && !configExists) {
    throw new Error(`SSH config file does not exist: ${configPath}`);
  }
  if (!options.remotePath || hasControlCharacters(options.remotePath)) {
    throw new Error('Remote transfer path is invalid');
  }

  const localPath = resolveTransferLocalPath(options.localPath, {
    platform,
    homeDirectory,
    cwd: options.cwd,
  });
  const pathApi = platform === 'win32' ? path.win32 : path;
  if (options.direction === 'upload') {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local upload path does not exist: ${localPath}`);
    }
    if (fs.statSync(localPath).isDirectory() && !options.recursive) {
      throw new Error('recursive must be true when uploading a directory');
    }
  } else {
    const destinationDirectory =
      fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()
        ? localPath
        : pathApi.dirname(localPath);
    if (
      !fs.existsSync(destinationDirectory) ||
      !fs.statSync(destinationDirectory).isDirectory()
    ) {
      throw new Error(
        `Local download destination directory does not exist: ${destinationDirectory}`,
      );
    }
  }

  const args: string[] = [];
  if (configExists) args.push('-F', configPath);
  if (options.recursive) args.push('-r');
  if (target.type === 'direct') args.push('-P', String(target.port ?? 22));
  const remoteSpec = getRemoteSpec(target, options.remotePath);
  args.push('--');
  if (options.direction === 'upload') {
    args.push(localPath, remoteSpec);
  } else {
    args.push(remoteSpec, localPath);
  }

  return {
    executable: options.executable ?? resolveSCPExecutable(platform),
    args,
    target,
    direction: options.direction,
    localPath,
    remotePath: options.remotePath,
  };
};

const getScreenSnapshot = (terminal: Terminal) => {
  const buffer = terminal.buffer.active;
  const startLine = buffer.baseY;
  const endLine = Math.min(buffer.length, startLine + terminal.rows);
  const lines: string[] = [];
  for (let index = startLine; index < endLine; index += 1) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return {
    screen: lines.join('\n'),
    cursor: { row: buffer.cursorY, column: buffer.cursorX },
  };
};

export class SSHTransferManager {
  private activeTransfers = new Set<ActiveTransfer>();

  async transfer(options: {
    connectionId: string;
    target: SSHTarget;
    direction: SSHTransferDirection;
    localPath: string;
    remotePath: string;
    recursive?: boolean;
    executable?: string;
  }): Promise<SSHTransferOutput> {
    const launchSpec = buildSCPLaunchSpec({
      target: options.target,
      direction: options.direction,
      localPath: options.localPath,
      remotePath: options.remotePath,
      recursive: options.recursive,
      executable: options.executable,
    });
    const terminal = new Terminal({
      allowProposedApi: true,
      cols: TERMINAL_COLS,
      rows: TERMINAL_ROWS,
      scrollback: 200,
      ...(process.platform === 'win32'
        ? { windowsPty: { backend: 'conpty' as const } }
        : {}),
    });

    let ptyProcess: IPty;
    try {
      ptyProcess = spawnPty(launchSpec.executable, launchSpec.args, {
        name: 'xterm-256color',
        cols: TERMINAL_COLS,
        rows: TERMINAL_ROWS,
        cwd: os.homedir(),
        env: {
          ...process.env,
          HOME: os.homedir(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
        ...(process.platform === 'win32' ? { useConpty: true } : {}),
      });
    } catch (error) {
      terminal.dispose();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start SCP transfer: ${message}`);
    }

    const activeTransfer: ActiveTransfer = {
      pty: ptyProcess,
      terminal,
      disposed: false,
    };
    this.activeTransfers.add(activeTransfer);
    let parseChain = Promise.resolve();
    let state: SSHTransferState = 'exited';
    let exitCode: number | undefined;
    let signal: number | undefined;
    let error: string | undefined;
    let promptWindow = '';
    let resolveExit: () => void = () => undefined;
    let exitResolved = false;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = () => {
        if (exitResolved) return;
        exitResolved = true;
        resolve();
      };
    });

    const failAndTerminate = (message: string) => {
      if (error) return;
      state = 'error';
      error = message;
      try {
        ptyProcess.kill();
      } catch (_error) {
        // The error result below remains authoritative even if kill fails.
      }
      resolveExit();
    };

    activeTransfer.dataSubscription = ptyProcess.onData((data) => {
      promptWindow = `${promptWindow}${stripAnsi(data)}`.slice(-2000);
      parseChain = parseChain
        .then(
          () =>
            new Promise<void>((resolve) => {
              terminal.write(data, resolve);
            }),
        )
        .catch((parseError) => {
          failAndTerminate(
            `Failed to parse SCP terminal output: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`,
          );
        });
      if (AUTH_PROMPT_PATTERN.test(promptWindow)) {
        failAndTerminate(
          'SCP requested a password or key passphrase. Configure key-based authentication or an SSH agent before transferring files.',
        );
      } else if (HOST_CONFIRMATION_PATTERN.test(promptWindow)) {
        failAndTerminate(
          'SCP requested host confirmation. Confirm the host first through SSHConnection, then retry the transfer.',
        );
      }
    });

    activeTransfer.exitSubscription = ptyProcess.onExit(
      ({ exitCode: processExitCode, signal: processSignal }) => {
        exitCode = processExitCode;
        signal = processSignal;
        if (!error && processExitCode !== 0) {
          state = 'error';
          error = `SCP exited with code ${processExitCode}`;
        }
        resolveExit();
      },
    );

    await exitPromise;
    await parseChain;
    const snapshot = getScreenSnapshot(terminal);
    this.disposeTransfer(activeTransfer);
    return {
      connection_id: options.connectionId,
      target: launchSpec.target,
      direction: launchSpec.direction,
      local_path: launchSpec.localPath,
      remote_path: launchSpec.remotePath,
      state,
      screen: snapshot.screen,
      cursor: snapshot.cursor,
      ...(exitCode !== undefined ? { exit_code: exitCode } : {}),
      ...(signal !== undefined ? { signal } : {}),
      ...(error ? { error } : {}),
    };
  }

  private disposeTransfer(transfer: ActiveTransfer) {
    if (transfer.disposed) return;
    transfer.disposed = true;
    transfer.dataSubscription?.dispose();
    transfer.exitSubscription?.dispose();
    transfer.terminal.dispose();
    this.activeTransfers.delete(transfer);
  }

  disposeAll() {
    for (const transfer of Array.from(this.activeTransfers)) {
      try {
        transfer.pty.kill();
      } catch (_error) {
        // The app is shutting down; continue releasing transfer processes.
      }
      this.disposeTransfer(transfer);
    }
  }
}

const sshTransferManager = new SSHTransferManager();
process.once('exit', () => sshTransferManager.disposeAll());
export default sshTransferManager;
