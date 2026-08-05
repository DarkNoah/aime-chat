import type { BashSessionCompletion } from '../tools/file-system/bash';

export class BackgroundBashCompletionCoordinator {
  private pending = new Map<string, Map<string, BashSessionCompletion>>();

  private suspendedThreads = new Set<string>();

  enqueue(completion: BashSessionCompletion) {
    const { threadId } = completion;
    if (!threadId) return false;

    const completions =
      this.pending.get(threadId) ?? new Map<string, BashSessionCompletion>();
    if (completions.has(completion.bashId)) return false;

    completions.set(completion.bashId, completion);
    this.pending.set(threadId, completions);
    return true;
  }

  consume(threadId: string) {
    const completions = this.pending.get(threadId);
    if (!completions || completions.size === 0) return [];

    this.pending.delete(threadId);
    return Array.from(completions.values());
  }

  clear(threadId: string) {
    this.pending.delete(threadId);
    this.suspendedThreads.delete(threadId);
  }

  setSuspended(threadId: string, suspended: boolean) {
    if (suspended) {
      this.suspendedThreads.add(threadId);
    } else {
      this.suspendedThreads.delete(threadId);
    }
  }

  canStart(threadId: string, running: boolean) {
    return !running && !this.suspendedThreads.has(threadId);
  }
}

export function formatBashCompletionStatus(completion: BashSessionCompletion) {
  if (completion.timedOut) return 'Timed out';
  if (completion.processSignal) {
    return `Terminated (${completion.processSignal})`;
  }
  if (completion.exitCode === 0) return 'Succeeded';
  if (typeof completion.exitCode === 'number') {
    return `Failed (exit code ${completion.exitCode})`;
  }
  if (completion.errorMessage) return 'Error';
  return 'Completed';
}

export function formatBashCompletionMessage(
  completions: BashSessionCompletion[],
) {
  const lines = [
    completions.length === 1
      ? 'Background execution completed.'
      : `Background execution completed (${completions.length} tasks).`,
    '',
  ];

  completions.forEach((completion, index) => {
    lines.push(
      `${index + 1}. Bash ID: ${completion.bashId}`,
      ``,
      `   Description: ${completion.description || 'None'}`,
      ``,
      `   Command: ${completion.command}`,
      ``,
      `   Directory: ${completion.directory || 'None'}`,
      ``,
      `   Status: ${formatBashCompletionStatus(completion)}`,
      ``,
      `   Exit code: ${completion.exitCode ?? 'None'}`,
      ``,
      `   Signal: ${completion.processSignal || 'None'}`,
      ``,
      `   Timed out: ${completion.timedOut ? 'Yes' : 'No'}`,
      ``,
      `   Error: ${completion.errorMessage || 'None'}`,
    );
    if (index < completions.length - 1) lines.push('');
  });

  return lines.join('\n');
}
