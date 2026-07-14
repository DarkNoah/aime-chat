/* eslint-disable import/no-cycle */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Terminal } from '@xterm/headless';
import fixPath from 'fix-path';
import type { IDisposable, IPty } from 'node-pty';
import { spawn as spawnPty } from 'node-pty';
import stripAnsi from 'strip-ansi';
import { appManager } from '@/main/app';
import { ChatEvent, type SSHSessionUpdate, type SSHTarget } from '@/types/chat';
import { nanoid } from '@/utils/nanoid';

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;
const DEFAULT_WAIT_TIMEOUT_MS = 3000;
const QUIET_WINDOW_MS = 250;
const MAX_UI_OUTPUT_LENGTH = 200_000;

export type { SSHTarget } from '@/types/chat';

export type SSHConnectionState = 'running' | 'exited' | 'error';

export type SSHSessionOutput = {
  connection_id: string;
  target: SSHTarget;
  state: SSHConnectionState;
  input_sent?: boolean;
  screen: string;
  cursor: {
    row: number;
    column: number;
  };
  exit_code?: number;
  signal?: number;
  error?: string;
};

export type SSHSessionSelector = {
  connection_id?: string;
  target?: SSHTarget;
};

export type SSHSessionSummary = {
  connectionId: string;
  target: SSHTarget;
  state: SSHConnectionState;
};

export type SSHCreateOptions = {
  cols?: number;
  rows?: number;
  wait_timeout_ms?: number;
};

export type SSHSession = {
  connectionId: string;
  target: SSHTarget;
  targetKey: string;
  pty: IPty;
  terminal: Terminal;
  state: SSHConnectionState;
  hasUnreadOutput: boolean;
  outputVersion: number;
  lastOutputAt: number;
  exitCode?: number;
  signal?: number;
  error?: string;
  parseChain: Promise<void>;
  dataSubscription?: IDisposable;
  exitSubscription?: IDisposable;
  waiters: Set<() => void>;
  redactions: Set<string>;
  startTime: Date;
  pendingUiOutput: string;
  uiOutputFlushTimer?: ReturnType<typeof setTimeout>;
  uiEventChain: Promise<void>;
  exitUpdateQueued: boolean;
  disposed: boolean;
};

export type SSHLaunchSpec = {
  executable: string;
  args: string[];
  configPath: string;
  target: SSHTarget;
  targetKey: string;
};

const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

const normalizeIPv6 = (host: string) => {
  const normalized = new URL(`http://[${host}]/`).hostname;
  return normalized.slice(1, -1).toLowerCase();
};

export const normalizeSSHTarget = (target: SSHTarget): SSHTarget => {
  if (target.type === 'config') {
    const name = target.name.trim();
    if (
      !name ||
      name.startsWith('-') ||
      /\s/.test(name) ||
      hasControlCharacters(name)
    ) {
      throw new Error('SSH config host name is invalid');
    }
    return { type: 'config', name };
  }

  const host = target.host.trim();
  const ipVersion = net.isIP(host);
  if (!ipVersion || host.startsWith('-') || hasControlCharacters(host)) {
    throw new Error('Direct SSH host must be a valid IPv4 or IPv6 address');
  }

  const port = target.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SSH port must be an integer between 1 and 65535');
  }

  const username = target.username?.trim();
  if (
    username !== undefined &&
    (!username ||
      username.startsWith('-') ||
      username.includes('@') ||
      hasControlCharacters(username))
  ) {
    throw new Error('SSH username is invalid');
  }

  return {
    type: 'direct',
    host: ipVersion === 6 ? normalizeIPv6(host) : host,
    port,
    ...(username ? { username } : {}),
  };
};

export const getSSHTargetKey = (target: SSHTarget) => {
  const normalized = normalizeSSHTarget(target);
  if (normalized.type === 'config') {
    return `config:${normalized.name.toLowerCase()}`;
  }
  return `direct:${normalized.username ?? ''}@${normalized.host}:${normalized.port}`;
};

export const getDefaultSSHConfigPath = (
  homeDirectory = os.homedir(),
  platform = process.platform,
) =>
  (platform === 'win32' ? path.win32 : path).join(
    homeDirectory,
    '.ssh',
    'config',
  );

export const getWindowsOpenSSHPath = (windowsDirectory: string) =>
  path.win32.join(windowsDirectory, 'System32', 'OpenSSH', 'ssh.exe');

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
    if (isExecutable(candidate, platform)) {
      return candidate;
    }
  }
  return undefined;
};

export const resolveSSHExecutable = (
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) => {
  if (platform !== 'win32') {
    fixPath();
  }

  if (platform === 'win32') {
    const windowsDirectory = env.WINDIR ?? env.SystemRoot;
    if (windowsDirectory) {
      const systemOpenSSH = getWindowsOpenSSHPath(windowsDirectory);
      if (isExecutable(systemOpenSSH, platform)) {
        return systemOpenSSH;
      }
    }

    const executable = findExecutableOnPath('ssh.exe', env, platform);
    if (executable) return executable;
  } else {
    const executable = findExecutableOnPath('ssh', env, platform);
    if (executable) return executable;
  }

  throw new Error(
    platform === 'win32'
      ? 'OpenSSH client was not found. Install the Windows OpenSSH Client or add ssh.exe to PATH.'
      : 'OpenSSH client was not found. Install ssh or add it to PATH.',
  );
};

export const buildSSHLaunchSpec = (
  target: SSHTarget,
  options: {
    executable?: string;
    configPath?: string;
  } = {},
): SSHLaunchSpec => {
  const normalizedTarget = normalizeSSHTarget(target);
  const configPath = options.configPath ?? getDefaultSSHConfigPath();
  const configExists = fs.existsSync(configPath);

  if (normalizedTarget.type === 'config' && !configExists) {
    throw new Error(`SSH config file does not exist: ${configPath}`);
  }

  const args: string[] = [];
  if (configExists) {
    args.push('-F', configPath);
  }
  args.push('-tt');

  if (normalizedTarget.type === 'direct') {
    args.push('-p', String(normalizedTarget.port));
    const destination = normalizedTarget.username
      ? `${normalizedTarget.username}@${normalizedTarget.host}`
      : normalizedTarget.host;
    args.push('--', destination);
  } else {
    args.push('--', normalizedTarget.name);
  }

  return {
    executable: options.executable ?? resolveSSHExecutable(),
    args,
    configPath,
    target: normalizedTarget,
    targetKey: getSSHTargetKey(normalizedTarget),
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
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    screen: lines.join('\n'),
    cursor: {
      row: buffer.cursorY,
      column: buffer.cursorX,
    },
  };
};

export const SSH_SPECIAL_KEYS = {
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  enter: '\r',
  tab: '\t',
  escape: '\u001b',
  backspace: '\u007f',
  space: ' ',
  ctrl_c: '\u0003',
  ctrl_d: '\u0004',
} as const;

export type SSHSpecialKey = keyof typeof SSH_SPECIAL_KEYS;

export class SSHManager {
  private sessionsById = new Map<string, SSHSession>();

  private activeSessionIdsByTarget = new Map<string, string>();

  private static notifySession(session: SSHSession) {
    const waiters = Array.from(session.waiters);
    session.waiters.clear();
    waiters.forEach((waiter) => waiter());
  }

  private static waitForChange(session: SSHSession, timeoutMs: number) {
    return new Promise<void>((resolve) => {
      let completed = false;
      let timer: ReturnType<typeof setTimeout>;
      const complete = () => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        session.waiters.delete(complete);
        resolve();
      };
      timer = setTimeout(complete, Math.max(0, timeoutMs));
      session.waiters.add(complete);
    });
  }

  private async waitForTerminalParse(session: SSHSession): Promise<void> {
    const { parseChain } = session;
    await parseChain;
    if (parseChain !== session.parseChain) {
      await this.waitForTerminalParse(session);
    }
  }

  private static redactSessionText(session: SSHSession, text: string) {
    let redacted = text;
    session.redactions.forEach((value) => {
      redacted = redacted.replaceAll(value, '[REDACTED]');
    });
    return redacted;
  }

  private queueSessionUpdate(
    session: SSHSession,
    event: SSHSessionUpdate['event'],
    outputDelta?: string,
  ) {
    session.uiEventChain = session.uiEventChain
      .then(async () => {
        await this.waitForTerminalParse(session);
        const snapshot = getScreenSnapshot(session.terminal);
        return appManager.sendEvent(ChatEvent.SSHSessionUpdated, {
          data: {
            event,
            connectionId: session.connectionId,
            target: session.target,
            state: session.state,
            ...(outputDelta
              ? {
                  outputDelta: SSHManager.redactSessionText(
                    session,
                    stripAnsi(outputDelta),
                  ),
                }
              : {}),
            screen: SSHManager.redactSessionText(session, snapshot.screen),
            cursor: snapshot.cursor,
            ...(session.exitCode !== undefined
              ? { exitCode: session.exitCode }
              : {}),
            ...(session.signal !== undefined ? { signal: session.signal } : {}),
            ...(session.error ? { error: session.error } : {}),
            startTime: session.startTime.toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies SSHSessionUpdate,
        });
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('failed to send SSH session update', error);
        return undefined;
      });
    return session.uiEventChain;
  }

  private flushSessionUiOutput(session: SSHSession) {
    if (session.uiOutputFlushTimer) {
      clearTimeout(session.uiOutputFlushTimer);
      session.uiOutputFlushTimer = undefined;
    }
    const outputDelta = session.pendingUiOutput;
    session.pendingUiOutput = '';
    if (!outputDelta) return session.uiEventChain;
    return this.queueSessionUpdate(session, 'output', outputDelta);
  }

  private scheduleSessionUiOutput(session: SSHSession, data: string) {
    session.pendingUiOutput += data;
    if (session.pendingUiOutput.length > MAX_UI_OUTPUT_LENGTH) {
      session.pendingUiOutput =
        session.pendingUiOutput.slice(-MAX_UI_OUTPUT_LENGTH);
    }
    if (!session.uiOutputFlushTimer) {
      session.uiOutputFlushTimer = setTimeout(() => {
        this.flushSessionUiOutput(session);
      }, 100);
    }
  }

  private queueSessionExit(session: SSHSession) {
    if (session.exitUpdateQueued) return session.uiEventChain;
    session.exitUpdateQueued = true;
    this.flushSessionUiOutput(session);
    return this.queueSessionUpdate(
      session,
      session.state === 'error' ? 'error' : 'exited',
    );
  }

  private static async waitForSettledOutput(
    session: SSHSession,
    options: {
      startVersion: number;
      timeoutMs: number;
      includeUnread: boolean;
    },
  ) {
    if (options.timeoutMs <= 0) return;

    const deadline = Date.now() + options.timeoutMs;
    let sawOutput =
      session.outputVersion > options.startVersion ||
      (options.includeUnread && session.hasUnreadOutput);

    while (Date.now() < deadline) {
      if (session.state !== 'running') break;

      if (sawOutput) {
        const quietFor = Date.now() - session.lastOutputAt;
        if (quietFor >= QUIET_WINDOW_MS) break;
        // The waiter is the event-driven body of this bounded quiet-window loop.
        // eslint-disable-next-line no-await-in-loop
        await SSHManager.waitForChange(
          session,
          Math.min(QUIET_WINDOW_MS - quietFor, deadline - Date.now()),
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await SSHManager.waitForChange(session, deadline - Date.now());
      }

      sawOutput =
        sawOutput ||
        session.outputVersion > options.startVersion ||
        (options.includeUnread && session.hasUnreadOutput);
    }
  }

  private async buildOutput(
    session: SSHSession,
    options: {
      acknowledgeOutput: boolean;
      inputSent?: boolean;
    },
  ): Promise<SSHSessionOutput> {
    // Data can arrive while an earlier xterm write is resolving. Wait until the
    // parse chain is stable so the returned screen includes all available data.
    await this.waitForTerminalParse(session);
    if (options.acknowledgeOutput) session.hasUnreadOutput = false;

    const snapshot = getScreenSnapshot(session.terminal);
    let { screen } = snapshot;
    session.redactions.forEach((value) => {
      screen = screen.replaceAll(value, '[REDACTED]');
    });
    return {
      connection_id: session.connectionId,
      target: session.target,
      state: session.state,
      ...(options.inputSent !== undefined
        ? { input_sent: options.inputSent }
        : {}),
      screen,
      cursor: snapshot.cursor,
      ...(session.exitCode !== undefined
        ? { exit_code: session.exitCode }
        : {}),
      ...(session.signal !== undefined ? { signal: session.signal } : {}),
      ...(session.error ? { error: session.error } : {}),
    };
  }

  private getSessionByTarget(target: SSHTarget) {
    const targetKey = getSSHTargetKey(target);
    const connectionId = this.activeSessionIdsByTarget.get(targetKey);
    if (!connectionId) return undefined;
    const session = this.sessionsById.get(connectionId);
    if (!session || session.state !== 'running') {
      this.activeSessionIdsByTarget.delete(targetKey);
      return undefined;
    }
    return session;
  }

  getSession(selector: SSHSessionSelector) {
    if (selector.connection_id) {
      return this.sessionsById.get(selector.connection_id);
    }
    if (selector.target) {
      return this.getSessionByTarget(selector.target);
    }
    return undefined;
  }

  getSessionSummaries(): SSHSessionSummary[] {
    return Array.from(this.sessionsById.values(), (session) => ({
      connectionId: session.connectionId,
      target: session.target,
      state: session.state,
    }));
  }

  async create(
    target: SSHTarget,
    options: SSHCreateOptions = {},
  ): Promise<SSHSessionOutput> {
    const normalizedTarget = normalizeSSHTarget(target);
    const existingSession = this.getSessionByTarget(normalizedTarget);
    const waitTimeoutMs = options.wait_timeout_ms ?? DEFAULT_WAIT_TIMEOUT_MS;

    if (existingSession) {
      return this.buildOutput(existingSession, { acknowledgeOutput: true });
    }

    const launchSpec = buildSSHLaunchSpec(normalizedTarget);
    const cols = options.cols ?? DEFAULT_COLS;
    const rows = options.rows ?? DEFAULT_ROWS;
    const terminal = new Terminal({
      allowProposedApi: true,
      cols,
      rows,
      scrollback: 1000,
      ...(process.platform === 'win32'
        ? { windowsPty: { backend: 'conpty' as const } }
        : {}),
    });

    let ptyProcess: IPty;
    try {
      ptyProcess = spawnPty(launchSpec.executable, launchSpec.args, {
        name: 'xterm-256color',
        cols,
        rows,
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
      throw new Error(`Failed to start SSH: ${message}`);
    }

    const connectionId = nanoid(8);
    const session: SSHSession = {
      connectionId,
      target: launchSpec.target,
      targetKey: launchSpec.targetKey,
      pty: ptyProcess,
      terminal,
      state: 'running',
      hasUnreadOutput: false,
      outputVersion: 0,
      lastOutputAt: Date.now(),
      parseChain: Promise.resolve(),
      waiters: new Set(),
      redactions: new Set(),
      startTime: new Date(),
      pendingUiOutput: '',
      uiEventChain: Promise.resolve(),
      exitUpdateQueued: false,
      disposed: false,
    };

    session.dataSubscription = ptyProcess.onData((data) => {
      if (session.disposed) return;
      session.hasUnreadOutput = true;
      session.outputVersion += 1;
      session.lastOutputAt = Date.now();
      session.parseChain = session.parseChain
        .then(
          () =>
            new Promise<void>((resolve) => {
              terminal.write(data, resolve);
            }),
        )
        .catch((error) => {
          session.error =
            error instanceof Error ? error.message : String(error);
          this.queueSessionUpdate(session, 'error');
        });
      this.scheduleSessionUiOutput(session, data);
      SSHManager.notifySession(session);
    });

    session.exitSubscription = ptyProcess.onExit(({ exitCode, signal }) => {
      if (session.disposed) return;
      session.state = 'exited';
      session.exitCode = exitCode;
      session.signal = signal;
      if (
        this.activeSessionIdsByTarget.get(session.targetKey) ===
        session.connectionId
      ) {
        this.activeSessionIdsByTarget.delete(session.targetKey);
      }
      this.queueSessionExit(session);
      SSHManager.notifySession(session);
    });

    this.sessionsById.set(connectionId, session);
    this.activeSessionIdsByTarget.set(launchSpec.targetKey, connectionId);
    this.queueSessionUpdate(session, 'started');

    await SSHManager.waitForSettledOutput(session, {
      startVersion: 0,
      timeoutMs: waitTimeoutMs,
      includeUnread: true,
    });
    return this.buildOutput(session, { acknowledgeOutput: true });
  }

  async write(
    session: SSHSession,
    data: string,
    options: {
      runInBackground?: boolean;
      waitTimeoutMs?: number;
      secretValue?: string;
    } = {},
  ): Promise<SSHSessionOutput> {
    if (session.state !== 'running') {
      throw new Error(`SSH connection is not running: ${session.connectionId}`);
    }

    const startVersion = session.outputVersion;
    if (options.secretValue) {
      session.redactions.add(options.secretValue);
    }
    session.pty.write(data);

    if (options.runInBackground) {
      return this.buildOutput(session, {
        acknowledgeOutput: false,
        inputSent: true,
      });
    }

    await SSHManager.waitForSettledOutput(session, {
      startVersion,
      timeoutMs: options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
      includeUnread: false,
    });
    return this.buildOutput(session, {
      acknowledgeOutput: true,
      inputSent: true,
    });
  }

  async read(
    session: SSHSession,
    waitTimeoutMs = 0,
  ): Promise<SSHSessionOutput> {
    await SSHManager.waitForSettledOutput(session, {
      startVersion: session.outputVersion,
      timeoutMs: waitTimeoutMs,
      includeUnread: true,
    });
    const output = await this.buildOutput(session, {
      acknowledgeOutput: true,
    });
    if (session.state !== 'running') {
      await session.uiEventChain;
      this.disposeSession(session);
    }
    return output;
  }

  async close(session: SSHSession): Promise<SSHSessionOutput> {
    if (session.state === 'running') {
      try {
        session.pty.kill();
      } catch (error) {
        session.error = error instanceof Error ? error.message : String(error);
        session.state = 'error';
      }
      if (session.state === 'running') {
        await SSHManager.waitForChange(session, 1000);
      }
      if (session.state === 'running') {
        session.state = 'exited';
      }
    }

    const output = await this.buildOutput(session, {
      acknowledgeOutput: true,
    });
    await this.queueSessionExit(session);
    this.disposeSession(session);
    return output;
  }

  private disposeSession(session: SSHSession) {
    if (session.disposed) return;
    session.disposed = true;
    if (session.uiOutputFlushTimer) {
      clearTimeout(session.uiOutputFlushTimer);
      session.uiOutputFlushTimer = undefined;
    }
    session.pendingUiOutput = '';
    session.dataSubscription?.dispose();
    session.exitSubscription?.dispose();
    session.terminal.dispose();
    session.waiters.forEach((waiter) => waiter());
    session.waiters.clear();
    this.sessionsById.delete(session.connectionId);
    if (
      this.activeSessionIdsByTarget.get(session.targetKey) ===
      session.connectionId
    ) {
      this.activeSessionIdsByTarget.delete(session.targetKey);
    }
  }

  disposeAll() {
    for (const session of Array.from(this.sessionsById.values())) {
      if (session.state === 'running') {
        session.exitSubscription?.dispose();
        session.exitSubscription = undefined;
        try {
          session.pty.kill();
        } catch (_error) {
          // The app is shutting down; continue releasing the remaining sessions.
        }
      }
      this.disposeSession(session);
    }
  }
}

const sshManager = new SSHManager();
export default sshManager;
