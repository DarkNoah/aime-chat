import type { BashSessionCompletion } from '@/main/tools/file-system/bash';
import {
  formatBashCompletionMessage,
  formatBashCompletionStatus,
} from '../background-bash-completion';
import { parseStructuredMessage } from '@/renderer/components/ai-elements/structured-message-parser';

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

    expect(text).toContain('<background-bash-completion version="1">');
    expect(text).toContain('<status>Failed (exit code 3)</status>');
    expect(parseStructuredMessage(text)).toMatchObject({
      type: 'background-bash-completion',
      tasks: [
        {
          bashId: 'bash-1',
          description: 'build project',
          command: 'command bash-1',
          directory: '/workspace',
          exitCode: 0,
        },
        { bashId: 'bash-2', exitCode: 3, errorMessage: 'build failed' },
      ],
    });
  });

  it('round trips shell metacharacters, Unicode, multiline errors and null exit codes', () => {
    const value = completion('bash-xml', {
      command:
        'printf \'<task>&amp; "测试"</task>\'\r\ncat < input > output && exit 2',
      description: 'Build & test <project>',
      directory: '/tmp/中文 & files',
      errorMessage: 'first line\n</error><task>not markup</task>',
      exitCode: null,
      processSignal: 'SIGTERM',
      timedOut: true,
    });
    const { threadId, resourceId, ...expected } = value;
    expect(
      parseStructuredMessage(formatBashCompletionMessage([value])),
    ).toEqual({
      type: 'background-bash-completion',
      tasks: [expected],
    });
  });
});
