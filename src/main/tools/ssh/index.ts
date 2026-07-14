/* eslint-disable import/no-cycle, max-classes-per-file */

import type { ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import { secretsManager } from '@/main/app/secrets';
import BaseTool from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import sshManager, {
  SSH_SPECIAL_KEYS,
  SSHManager,
  SSHSessionOutput,
  SSHTarget,
} from './manager';
import sshTransferManager, { SSHTransferOutput } from './transfer-manager';

const sshTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('config'),
    name: z
      .string()
      .min(1)
      .describe('Host name from the local ~/.ssh/config file'),
  }),
  z.object({
    type: z.literal('direct'),
    host: z.string().min(1).describe('Direct IPv4 or IPv6 address'),
    port: z
      .number()
      .int()
      .min(1)
      .max(65535)
      .optional()
      .default(22)
      .describe('SSH port, defaults to 22'),
    username: z
      .string()
      .min(1)
      .optional()
      .describe('Optional SSH username; OpenSSH defaults apply when omitted'),
  }),
]);

const sshMarkdownOutputSchema = z
  .string()
  .describe(
    'Markdown-formatted SSH session status and current terminal screen',
  );

const sshTransferMarkdownOutputSchema = z
  .string()
  .describe('Markdown-formatted SCP transfer status and current screen');

const escapeMarkdownTableValue = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');

const formatSSHTarget = (target: SSHTarget) => {
  if (target.type === 'config') return `config:${target.name}`;
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${target.username ? `${target.username}@` : ''}${host}:${target.port ?? 22}`;
};

const formatFencedSection = (title: string, value: string) => {
  const longestBacktickRun = Math.max(
    0,
    ...Array.from(value.matchAll(/`+/g), (match) => match[0].length),
  );
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `## ${title}\n\n${fence}text\n${value}\n${fence}`;
};

export const formatSSHSessionOutput = (output: SSHSessionOutput) => {
  const rows = [
    ['Connection ID', output.connection_id],
    ['Target', formatSSHTarget(output.target)],
    ['State', output.state],
    ['Cursor', `${output.cursor.row}:${output.cursor.column}`],
  ];
  if (output.input_sent !== undefined) {
    rows.push(['Input sent', output.input_sent ? 'yes' : 'no']);
  }
  if (output.exit_code !== undefined) {
    rows.push(['Exit code', String(output.exit_code)]);
  }
  if (output.signal !== undefined) {
    rows.push(['Signal', String(output.signal)]);
  }

  const metadata = rows
    .map(
      ([label, value]) => `| ${label} | ${escapeMarkdownTableValue(value)} |`,
    )
    .join('\n');
  const sections = [
    '# SSH Session',
    '| Field | Value |',
    '| --- | --- |',
    metadata,
    formatFencedSection('Screen', output.screen),
  ];
  if (output.error) {
    sections.push(formatFencedSection('Error', output.error));
  }
  return sections.join('\n\n');
};

export const formatSSHTransferOutput = (output: SSHTransferOutput) => {
  const rows: Array<[string, string]> = [
    ['Connection ID', output.connection_id],
    ['Target', formatSSHTarget(output.target)],
    ['Direction', output.direction],
    ['Local path', output.local_path],
    ['Remote path', output.remote_path],
    ['State', output.state],
    ['Cursor', `${output.cursor.row}:${output.cursor.column}`],
  ];
  if (output.exit_code !== undefined) {
    rows.push(['Exit code', String(output.exit_code)]);
  }
  if (output.signal !== undefined) {
    rows.push(['Signal', String(output.signal)]);
  }

  const metadata = rows
    .map(
      ([label, value]) => `| ${label} | ${escapeMarkdownTableValue(value)} |`,
    )
    .join('\n');
  const sections = [
    '# SSH Transfer',
    '| Field | Value |',
    '| --- | --- |',
    metadata,
    formatFencedSection('Screen', output.screen),
  ];
  if (output.error) sections.push(formatFencedSection('Error', output.error));
  return sections.join('\n\n');
};

const addSelectorValidation = (
  value: { connection_id?: string; target?: unknown },
  context: z.RefinementCtx,
) => {
  if (
    Number(value.connection_id !== undefined) +
      Number(value.target !== undefined) !==
    1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Specify exactly one of connection_id or target',
    });
  }
};

const getSessionOrThrow = (
  manager: SSHManager,
  selector: { connection_id?: string; target?: unknown },
) => {
  const session = manager.getSession({
    connection_id: selector.connection_id,
    target: selector.target as SSHTarget | undefined,
  });
  if (!session) {
    const identity = selector.connection_id
      ? `connection_id ${selector.connection_id}`
      : 'the requested target';
    throw new Error(`SSH connection was not found for ${identity}`);
  }
  return session;
};

const getSecretValue = async (secretName: string) => {
  const secrets = await secretsManager.getSecretsEnv();
  if (!(secretName in secrets)) {
    throw new Error(`Global Secret was not found: ${secretName}`);
  }
  return secrets[secretName];
};

export class SSHConnection extends BaseTool {
  static readonly toolName = 'SSHConnection';

  id = SSHConnection.toolName;

  description = `Creates or closes a persistent interactive SSH connection backed by a real PTY.

- Use a config target to connect by a Host name from the local ~/.ssh/config file.
- Use a direct target for an IPv4/IPv6 address with an optional port and username.
- Creating the same target again reuses the active application-wide connection.
- Connection output is a combined PTY stream; password, host-key, and passphrase prompts are returned immediately when available.
- Results are returned as Markdown with session metadata and the current terminal screen.`;

  inputSchema = z
    .object({
      action: z.enum(['create', 'close']),
      connection_id: z
        .string()
        .min(1)
        .optional()
        .describe('Existing connection ID; only valid when action is close'),
      target: sshTargetSchema.optional(),
      cols: z.number().int().min(40).max(500).optional().default(120),
      rows: z.number().int().min(10).max(200).optional().default(30),
      wait_timeout_ms: z
        .number()
        .int()
        .min(0)
        .max(3000)
        .optional()
        .default(3000),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.action === 'create') {
        if (!value.target) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['target'],
            message: 'target is required when creating an SSH connection',
          });
        }
        if (value.connection_id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['connection_id'],
            message: 'connection_id is not valid when creating a connection',
          });
        }
      } else {
        addSelectorValidation(value, context);
      }
    });

  outputSchema = sshMarkdownOutputSchema;

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    if (inputData.action === 'create') {
      const output = await sshManager.create(inputData.target as SSHTarget, {
        cols: inputData.cols,
        rows: inputData.rows,
        wait_timeout_ms: inputData.wait_timeout_ms,
      });
      return formatSSHSessionOutput(output);
    }

    const session = getSessionOrThrow(sshManager, inputData);
    return formatSSHSessionOutput(await sshManager.close(session));
  };
}

const sshSpecialKeySchema = z.enum([
  'up',
  'down',
  'right',
  'left',
  'enter',
  'tab',
  'escape',
  'backspace',
  'space',
  'ctrl_c',
  'ctrl_d',
]);

export class SSHInput extends BaseTool {
  static readonly toolName = 'SSHInput';

  id = SSHInput.toolName;

  description = `Writes commands, credentials, text, or special keys to an interactive SSH PTY.

- Use SSHConnection first, then locate the connection only with its connection_id.
- Prefer secret_name for passwords and private-key passphrases. Plain text tool inputs are stored in the chat tool-call history.
- Foreground mode returns after output becomes quiet for 250ms or the wait timeout is reached. Background mode returns immediately; use SSHOutput later.
- Arrow and control keys support interactive menus and full-screen CLI programs.
- Results are returned as Markdown with the current terminal screen.`;

  inputSchema = z
    .object({
      connection_id: z
        .string()
        .min(1)
        .describe('Connection ID returned by SSHConnection'),
      text: z.string().optional().describe('Literal text or command to write'),
      secret_name: z
        .string()
        .min(1)
        .optional()
        .nullable()
        .describe('Name of an existing global application Secret to write'),
      key: sshSpecialKeySchema.optional(),
      append_enter: z
        .boolean()
        .optional()
        .default(true)
        .describe('Append a carriage return to text or secret input'),
      run_in_background: z.boolean().optional().default(false),
      wait_timeout_ms: z
        .number()
        .int()
        .min(0)
        .max(30000)
        .optional()
        .default(3000),
    })
    .strict()
    .superRefine((value, context) => {
      const payloadCount =
        Number(value.text !== undefined) +
        Number(value.secret_name != null) +
        Number(value.key !== undefined);
      if (payloadCount !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Specify exactly one of text, secret_name, or key',
        });
      }
    });

  outputSchema = sshMarkdownOutputSchema;

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const session = getSessionOrThrow(sshManager, {
      connection_id: inputData.connection_id,
    });

    let data: string;
    let secretValue: string | undefined;
    if (inputData.key) {
      data = SSH_SPECIAL_KEYS[inputData.key];
    } else if (inputData.secret_name) {
      secretValue = await getSecretValue(inputData.secret_name);
      data = secretValue;
      if (inputData.append_enter) data += '\r';
    } else {
      data = inputData.text ?? '';
      if (inputData.append_enter) data += '\r';
    }

    return formatSSHSessionOutput(
      await sshManager.write(session, data, {
        runInBackground: inputData.run_in_background,
        waitTimeoutMs: inputData.wait_timeout_ms,
        secretValue,
      }),
    );
  };
}

export class SSHTransfer extends BaseTool {
  static readonly toolName = 'SSHTransfer';

  id = SSHTransfer.toolName;

  description = `Uploads or downloads files through the local OpenSSH scp client.

- Use a running SSH connection_id; its normalized target and local SSH configuration are reused.
- action=upload copies local_path to remote_path; action=download copies remote_path to local_path.
- Set recursive=true when transferring a directory.
- The tool waits until scp succeeds or exits with an error. Password, passphrase, and host-confirmation prompts terminate with a clear error; configure key-based authentication or an SSH agent first.
- Windows uses the built-in OpenSSH scp.exe when available and preserves the complete process environment, including SystemRoot.
- Results are Markdown with transfer metadata and the current SCP terminal screen.`;

  inputSchema = z
    .object({
      action: z.enum(['upload', 'download']),
      connection_id: z.string().min(1).describe('Running SSH connection ID'),
      local_path: z
        .string()
        .min(1)
        .describe('Local upload source or download destination path'),
      remote_path: z
        .string()
        .min(1)
        .describe('Remote upload destination or download source path'),
      recursive: z.boolean().optional().default(false),
    })
    .strict();

  outputSchema = sshTransferMarkdownOutputSchema;

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const sshSession = getSessionOrThrow(sshManager, {
      connection_id: inputData.connection_id,
    });
    if (sshSession.state !== 'running') {
      throw new Error(
        `SSH connection is not running: ${sshSession.connectionId}`,
      );
    }
    return formatSSHTransferOutput(
      await sshTransferManager.transfer({
        connectionId: sshSession.connectionId,
        target: sshSession.target,
        direction: inputData.action,
        localPath: inputData.local_path,
        remotePath: inputData.remote_path,
        recursive: inputData.recursive,
      }),
    );
  };
}

export class SSHOutput extends BaseTool {
  static readonly toolName = 'SSHOutput';

  id = SSHOutput.toolName;

  description = `Retrieves output from a persistent SSH connection.

- Locate the connection only with the connection_id returned by SSHConnection.
- Returns the reconstructed current terminal screen and zero-based cursor position for interactive CLI redraws.
- wait_timeout_ms can long-poll for new output or connection exit; zero returns immediately.
- When an exited connection is read, its final screen is returned and the retained session is released.
- Results are returned as Markdown.`;

  inputSchema = z
    .object({
      connection_id: z
        .string()
        .min(1)
        .describe('Connection ID returned by SSHConnection'),
      wait_timeout_ms: z.number().int().min(0).max(30000).optional().default(0),
    })
    .strict();

  outputSchema = sshMarkdownOutputSchema;

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const session = getSessionOrThrow(sshManager, inputData);
    return formatSSHSessionOutput(
      await sshManager.read(session, inputData.wait_timeout_ms),
    );
  };
}

export class SSHToolkit extends BaseToolkit {
  static readonly toolName = 'SSHToolkit';

  id = SSHToolkit.toolName;

  description =
    'Persistent interactive SSH toolkit using local OpenSSH configuration and a native PTY';

  constructor(params?: BaseToolkitParams) {
    super(
      [new SSHConnection(), new SSHInput(), new SSHOutput(), new SSHTransfer()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}

export { sshManager, sshTransferManager };
