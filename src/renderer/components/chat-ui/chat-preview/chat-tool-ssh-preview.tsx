/* eslint-disable camelcase */
import { ToolUIPart } from 'ai';
import React, { ComponentProps, ForwardedRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconClock,
  IconLoader2,
  IconNetwork,
  IconTerminal2,
} from '@tabler/icons-react';
import { cn } from '@/renderer/lib/utils';
import type { SSHTarget } from '@/types/chat';
import { Badge } from '../../ui/badge';

export interface ChatToolSSHPreviewRef {}

export type ChatToolSSHPreviewProps = ComponentProps<'div'> & {
  part?: ToolUIPart;
};

type SSHInputData = {
  action?: 'create' | 'close' | 'upload' | 'download';
  connection_id?: string;
  target?: SSHTarget;
  local_path?: string;
  remote_path?: string;
  recursive?: boolean;
  text?: string;
  secret_name?: string | null;
  key?: string;
  append_enter?: boolean;
  run_in_background?: boolean;
  wait_timeout_ms?: number;
};

export type ParsedSSHMarkdown = {
  connectionId?: string;
  target?: string;
  state?: string;
  cursor?: string;
  inputSent?: boolean;
  exitCode?: string;
  signal?: string;
  direction?: 'upload' | 'download';
  localPath?: string;
  remotePath?: string;
  screen?: string;
  error?: string;
};

const unescapeTableValue = (value: string) =>
  value.replaceAll('\\|', '|').replaceAll('\\\\', '\\').trim();

const getTableValue = (markdown: string, label: string) => {
  const prefix = `| ${label} |`;
  const line = markdown
    .split('\n')
    .find((candidate) => candidate.startsWith(prefix));
  if (!line) return undefined;
  return unescapeTableValue(line.slice(prefix.length).replace(/\|\s*$/, ''));
};

const getFencedSection = (markdown: string, title: string) => {
  const marker = `## ${title}\n\n`;
  const sectionStart = markdown.indexOf(marker);
  if (sectionStart < 0) return undefined;
  const contentStart = sectionStart + marker.length;
  const fenceLineEnd = markdown.indexOf('\n', contentStart);
  if (fenceLineEnd < 0) return undefined;
  const fenceLine = markdown.slice(contentStart, fenceLineEnd);
  const fence = fenceLine.replace(/text$/, '');
  if (!/^`{3,}$/.test(fence)) return undefined;
  const closingFence = `\n${fence}`;
  const contentEnd = markdown.indexOf(closingFence, fenceLineEnd + 1);
  if (contentEnd < 0) return undefined;
  return markdown.slice(fenceLineEnd + 1, contentEnd);
};

export const parseSSHMarkdown = (output: unknown): ParsedSSHMarkdown | null => {
  if (
    typeof output !== 'string' ||
    (!output.startsWith('# SSH Session') &&
      !output.startsWith('# SSH Transfer'))
  ) {
    return null;
  }
  return {
    connectionId: getTableValue(output, 'Connection ID'),
    target: getTableValue(output, 'Target'),
    state: getTableValue(output, 'State'),
    cursor: getTableValue(output, 'Cursor'),
    inputSent: getTableValue(output, 'Input sent') === 'yes',
    exitCode: getTableValue(output, 'Exit code'),
    signal: getTableValue(output, 'Signal'),
    direction: getTableValue(output, 'Direction') as
      | 'upload'
      | 'download'
      | undefined,
    localPath: getTableValue(output, 'Local path'),
    remotePath: getTableValue(output, 'Remote path'),
    screen: getFencedSection(output, 'Screen'),
    error: getFencedSection(output, 'Error'),
  };
};

const formatTarget = (target?: SSHTarget) => {
  if (!target) return undefined;
  if (target.type === 'config') return `config:${target.name}`;
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `${target.username ? `${target.username}@` : ''}${host}:${target.port ?? 22}`;
};

export const ChatToolSSHPreview = React.forwardRef<
  ChatToolSSHPreviewRef,
  ChatToolSSHPreviewProps
>(
  (
    props: ChatToolSSHPreviewProps,
    ref: ForwardedRef<ChatToolSSHPreviewRef>,
  ) => {
    const { className, part, ...rest } = props;
    const { t } = useTranslation();
    const toolName = part?.type?.split('-').slice(1).join('-');
    const input = useMemo(
      () => (part?.input as SSHInputData | undefined) ?? {},
      [part?.input],
    );
    const output = useMemo(
      () => parseSSHMarkdown(part?.output),
      [part?.output],
    );
    const isWaiting =
      (part?.state === 'input-streaming' ||
        part?.state === 'input-available') &&
      !part?.output;
    const target = output?.target || formatTarget(input.target);
    const connectionId = output?.connectionId || input.connection_id;

    const inputLine = useMemo(() => {
      if (toolName === 'SSHConnection') {
        if (input.action === 'create')
          return `ssh ${formatTarget(input.target)}`;
        return `close ${input.connection_id || formatTarget(input.target) || ''}`;
      }
      if (toolName === 'SSHOutput') {
        return `read ${input.connection_id ?? ''}`;
      }
      if (toolName === 'SSHTransfer') {
        if (input.action === 'download') {
          return `scp ${input.remote_path ?? ''} ${input.local_path ?? ''}`;
        }
        return `scp ${input.local_path ?? ''} ${input.remote_path ?? ''}`;
      }
      if (input.secret_name) {
        return `${t('ssh_status.secret')}: ${input.secret_name}`;
      }
      if (input.key) return `${t('ssh_status.key')}: ${input.key}`;
      return input.text ?? '';
    }, [input, t, toolName]);

    let statusTone = 'done';
    if (output?.state === 'running') {
      statusTone = 'running';
    } else if (
      output?.state === 'error' ||
      (output?.state === 'exited' &&
        output.exitCode !== undefined &&
        output.exitCode !== '0')
    ) {
      statusTone = 'error';
    }

    return (
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900',
          'dark:border-zinc-800 dark:bg-zinc-950',
          className,
        )}
        {...rest}
      >
        <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-800 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <IconNetwork className="size-3.5 text-zinc-400" />
          <span
            className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400"
            title={target || connectionId}
          >
            {target || connectionId || t('ssh_status.title')}
          </span>
          <div className="flex items-center gap-1.5">
            {input.run_in_background && (
              <Badge
                variant="outline"
                className="h-5 border-zinc-600 bg-zinc-700/50 px-1.5 text-[10px] text-zinc-300"
              >
                {t('ssh_status.background')}
              </Badge>
            )}
            {input.wait_timeout_ms !== undefined && (
              <Badge
                variant="outline"
                className="h-5 border-zinc-600 bg-zinc-700/50 px-1.5 text-[10px] text-zinc-300"
              >
                <IconClock className="mr-0.5 size-3" />
                {input.wait_timeout_ms}ms
              </Badge>
            )}
            {output?.state && (
              <Badge
                variant="outline"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  statusTone === 'running' &&
                    'border-blue-500/50 bg-blue-500/20 text-blue-300',
                  statusTone === 'done' &&
                    'border-green-500/50 bg-green-500/20 text-green-300',
                  statusTone === 'error' &&
                    'border-red-500/50 bg-red-500/20 text-red-300',
                )}
              >
                {t(`ssh_status.state_${output.state}`)}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-3 font-mono text-sm">
          <div className="flex items-start gap-2">
            <span className="shrink-0 select-none text-green-400">$</span>
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all text-zinc-100">
              {inputLine}
            </pre>
          </div>

          {isWaiting && (
            <div className="mt-3 flex items-center gap-2 text-zinc-400">
              <IconLoader2 className="size-4 animate-spin motion-reduce:animate-none" />
              <span className="text-xs">
                {toolName === 'SSHTransfer'
                  ? t('ssh_status.transfer_waiting')
                  : t('ssh_status.waiting_output')}
              </span>
            </div>
          )}

          {output?.screen && (
            <div className="mt-3 border-t border-zinc-700/50 pt-3 dark:border-zinc-800/50">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                <IconTerminal2 className="size-3.5" />
                {t('ssh_status.screen')}
                {output.cursor && (
                  <span className="ml-auto">{output.cursor}</span>
                )}
              </div>
              <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all text-xs text-zinc-300">
                {output.screen}
              </pre>
            </div>
          )}

          {output?.error && (
            <div className="mt-3 border-t border-zinc-700/50 pt-3 dark:border-zinc-800/50">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-red-400">
                <IconAlertTriangle className="size-3.5" />
                {t('ssh_status.status_failed')}
              </div>
              <pre className="whitespace-pre-wrap break-all text-xs text-red-400/90">
                {output.error}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  },
);
