/* eslint-disable camelcase */
import { ToolUIPart } from 'ai';
import React, { ComponentProps, ForwardedRef, useMemo } from 'react';
import { cn } from '@/renderer/lib/utils';
import {
  IconTerminal2,
  IconClock,
  IconLoader2,
  IconCheck,
  IconX,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { Badge } from '../../ui/badge';

export interface ChatToolBashPreviewRef {}

export type ChatToolBashPreviewProps = ComponentProps<'div'> & {
  part?: ToolUIPart;
};

// Parse the structured output text format
interface ParsedOutput {
  command?: string;
  directory?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  exitCode?: number;
  signal?: string;
  pgid?: string;
}

const parseOutputText = (text: string): ParsedOutput => {
  const result: ParsedOutput = {};

  // Match patterns like "Field: value" where value can be multiline until next field
  const fieldPatterns: { key: keyof ParsedOutput; label: string }[] = [
    { key: 'command', label: 'Command' },
    { key: 'directory', label: 'Directory' },
    { key: 'stdout', label: 'Stdout' },
    { key: 'stderr', label: 'Stderr' },
    { key: 'error', label: 'Error' },
    { key: 'signal', label: 'Signal' },
    { key: 'pgid', label: 'Process Group PGID' },
  ];

  // Find Exit Code separately as it's a number
  const exitCodeMatch = text.match(/Exit Code:\s*(\d+)/);
  if (exitCodeMatch) {
    result.exitCode = parseInt(exitCodeMatch[1], 10);
  }

  // Create a list of all field positions
  const fieldPositions: {
    key: keyof ParsedOutput;
    start: number;
    labelEnd: number;
  }[] = [];

  for (const { key, label } of fieldPatterns) {
    const regex = new RegExp(`^${label}:\\s*`, 'm');
    const match = text.match(regex);
    if (match && match.index !== undefined) {
      fieldPositions.push({
        key,
        start: match.index,
        labelEnd: match.index + match[0].length,
      });
    }
  }

  // Also add Exit Code position
  if (exitCodeMatch && exitCodeMatch.index !== undefined) {
    fieldPositions.push({
      key: 'exitCode' as keyof ParsedOutput,
      start: exitCodeMatch.index,
      labelEnd: exitCodeMatch.index + exitCodeMatch[0].length,
    });
  }

  // Sort by position
  fieldPositions.sort((a, b) => a.start - b.start);

  // Extract values
  fieldPositions.forEach((current, i) => {
    const next = fieldPositions[i + 1];
    const valueEnd = next ? next.start : text.length;
    const value = text.slice(current.labelEnd, valueEnd).trim();

    if (current.key !== 'exitCode') {
      // Check for empty values like "(empty)" or "(none)"
      if (value && !value.match(/^\((empty|none)\)$/i)) {
        result[current.key] = value;
      }
    }
  });

  return result;
};

export const ChatToolBashPreview = React.forwardRef<
  ChatToolBashPreviewRef,
  ChatToolBashPreviewProps
>(
  (
    props: ChatToolBashPreviewProps,
    ref: ForwardedRef<ChatToolBashPreviewRef>,
  ) => {
    const { className, part, ...rest } = props;

    const {
      command: inputCommand = '',
      directory: inputDirectory = '',
      description = '',
      timeout,
      run_in_background = false,
    } = (part?.input as {
      command?: string;
      directory?: string;
      description?: string;
      timeout?: number;
      run_in_background?: boolean;
    }) || {};

    // Check if still running (input available but no output yet)
    const isRunning = useMemo(() => {
      const state = part?.state;
      return (
        (state === 'input-streaming' || state === 'input-available') &&
        !part?.output
      );
    }, [part?.state, part?.output]);

    // Parse the output text
    const parsedOutput = useMemo((): ParsedOutput | null => {
      if (!part?.output) return null;
      const partOutput = part.output as unknown;
      if (typeof partOutput === 'string') {
        return parseOutputText(partOutput);
      }
      if (typeof partOutput === 'object' && partOutput !== null) {
        const obj = partOutput as Record<string, unknown>;
        // Handle structured content array
        if ('content' in obj && Array.isArray(obj.content)) {
          const text = obj.content
            .filter((item: { type?: string }) => item.type === 'text')
            .map((item: { text?: string }) => item.text || '')
            .join('\n');
          return parseOutputText(text);
        }
      }
      return null;
    }, [part?.output]);

    // Use parsed values or fallback to input values
    const command = parsedOutput?.command || inputCommand;
    const directory = parsedOutput?.directory || inputDirectory;
    const stdout = parsedOutput?.stdout;
    const stderr = parsedOutput?.stderr;
    const error = parsedOutput?.error;
    const exitCode = parsedOutput?.exitCode;
    const signal = parsedOutput?.signal;

    // Get short directory name for display
    const shortDir = useMemo(() => {
      if (!directory) return '~';
      const parts = directory.split('/').filter(Boolean);
      if (parts.length <= 2) return directory;
      return `.../${parts.slice(-2).join('/')}`;
    }, [directory]);

    // Determine status
    const isSuccess = exitCode === 0;
    const hasError = exitCode !== undefined && exitCode !== 0;
    const hasStderr = stderr && stderr.trim().length > 0;

    return (
      <div
        className={cn(
          'rounded-lg overflow-hidden border',
          // Light theme: darker terminal look
          'bg-zinc-900 border-zinc-700',
          // Dark theme: slightly lighter terminal
          'dark:bg-zinc-950 dark:border-zinc-800',
          className,
        )}
        {...rest}
      >
        {/* Terminal Title Bar */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 border-b',
            'bg-zinc-800 border-zinc-700',
            'dark:bg-zinc-900 dark:border-zinc-800',
          )}
        >
          {/* Traffic lights */}
          {/* <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors" />
            <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors" />
          </div> */}

          {/* Terminal icon and path */}
          <div className="flex-1 flex items-center justify-start gap-2 text-zinc-400 text-xs min-w-0">
            <IconTerminal2 className="w-3.5 h-3.5" />
            <span className="font-mono truncate flex-1" title={directory}>
              {shortDir}
            </span>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-1.5">
            {run_in_background && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 bg-zinc-700/50 border-zinc-600 text-zinc-300"
              >
                background
              </Badge>
            )}
            {timeout && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 bg-zinc-700/50 border-zinc-600 text-zinc-300"
              >
                <IconClock className="w-3 h-3 mr-0.5" />
                {timeout}ms
              </Badge>
            )}
            {/* Exit code badge */}
            {exitCode !== undefined && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] px-1.5 py-0 h-5',
                  isSuccess
                    ? 'bg-green-500/20 border-green-500/50 text-green-400'
                    : 'bg-red-500/20 border-red-500/50 text-red-400',
                )}
              >
                {isSuccess ? (
                  <IconCheck className="w-3 h-3 mr-0.5" />
                ) : (
                  <IconX className="w-3 h-3 mr-0.5" />
                )}
                {exitCode}
              </Badge>
            )}
          </div>
        </div>

        {/* Terminal Content */}
        <div className="p-3 font-mono text-sm">
          {/* Description if provided */}
          {description && (
            <div className="text-zinc-500 dark:text-zinc-600 text-xs mb-2 italic">
              # {description}
            </div>
          )}

          {/* Command line with prompt */}
          <div className="flex items-start gap-2">
            {/* Prompt */}
            <span className="text-green-400 dark:text-green-500 select-none shrink-0">
              $
            </span>
            {/* Command */}
            <pre className="text-zinc-100 dark:text-zinc-200 whitespace-pre-wrap break-all flex-1">
              {command}
            </pre>
          </div>

          {/* Running indicator */}
          {isRunning && (
            <div className="flex items-center gap-2 mt-3 text-zinc-400">
              <IconLoader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Running...</span>
            </div>
          )}

          {/* Stdout Output */}
          {stdout && (
            <div className="pt-3 ">
              <pre
                className={cn(
                  'text-xs whitespace-pre-wrap break-all',
                  'text-zinc-300 dark:text-zinc-400',
                )}
              >
                {stdout}
              </pre>
            </div>
          )}

          {/* Stderr Output */}
          {hasStderr && (
            <div className="mt-3 pt-3 border-t border-zinc-700/50 dark:border-zinc-800/50">
              <div className="flex items-center gap-1.5 mb-2">
                <IconAlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-[10px] text-yellow-500 uppercase tracking-wider">
                  Stderr
                </span>
              </div>
              <pre
                className={cn(
                  'text-xs whitespace-pre-wrap break-all',
                  'text-yellow-400/80',
                  'max-h-[150px] overflow-y-auto',
                )}
              >
                {stderr}
              </pre>
            </div>
          )}

          {/* Error Output */}
          {error && (
            <div className="mt-3 pt-3 border-t border-zinc-700/50 dark:border-zinc-800/50">
              <div className="flex items-center gap-1.5 mb-2">
                <IconX className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] text-red-500 uppercase tracking-wider">
                  Error
                </span>
              </div>
              <pre
                className={cn(
                  'text-xs whitespace-pre-wrap break-all',
                  'text-red-400/80',
                  'max-h-[150px] overflow-y-auto',
                )}
              >
                {error}
              </pre>
            </div>
          )}

          {/* Signal info if present */}
          {signal && (
            <div className="mt-2 pt-2 border-t border-zinc-700/50 dark:border-zinc-800/50">
              <span className="text-[10px] text-zinc-500">
                Signal: <span className="text-zinc-400">{signal}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  },
);
