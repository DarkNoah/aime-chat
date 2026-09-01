import type { BashSessionCompletion } from '@/main/tools/file-system/bash';
import {
  formatBashCompletionMessage,
  formatBashCompletionStatus,
} from '../background-bash-completion';

function completion(
  bashId: string,
  patch: Partial<BashSessionCompletion> = {},
): BashSessionCompletion {
  return {
    bashId,
    threadId: 'thread-1',
    resourceId: 'default',
    command: `command ${bashId}`,
    exitCode: 0,
    processSignal: null,
    timedOut: false,
    startTime: '2026-08-05T00:00:00.000Z',
    finishedAt: '2026-08-05T00:00:01.000Z',
    ...patch,
  };
}

describe('formatBashCompletionStatus', () => {
  it.each([
    [completion('success'), 'Succeeded'],
    [completion('failed', { exitCode: 2 }), 'Failed (exit code 2)'],
    [
      completion('timeout', {
        exitCode: null,
        processSignal: 'SIGTERM',
        timedOut: true,
      }),
      'Timed out',
    ],
    [
      completion('signal', { exitCode: null, processSignal: 'SIGKILL' }),
      'Terminated (SIGKILL)',
    ],
    [
      completion('error', { exitCode: null, errorMessage: 'spawn failed' }),
      'Error',
    ],
  ])('formats terminal status %#', (value, expected) => {
    expect(formatBashCompletionStatus(value)).toBe(expected);
  });
});

describe('formatBashCompletionMessage', () => {
  it('includes every completion field in a visible batched message', () => {
    const text = formatBashCompletionMessage([
      completion('bash-1', {
        description: 'build project',
        directory: '/workspace',
      }),
      completion('bash-2', {
        exitCode: 3,
        errorMessage: 'build failed',
      }),
    ]);

    expect(text).toContain('Background execution completed (2 tasks).');
    expect(text).toContain('1. Bash ID: bash-1');
    expect(text).toContain('Description: build project');
    expect(text).toContain('Command: command bash-1');
    expect(text).toContain('Directory: /workspace');
    expect(text).toContain('2. Bash ID: bash-2');
    expect(text).toContain('Status: Failed (exit code 3)');
    expect(text).toContain('Error: build failed');
  });
});
