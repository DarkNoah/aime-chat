import type { BashSessionCompletion } from '../tools/file-system/bash';
import { messageXmlField } from '@/utils/structured-message';

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
  return [
    '<background-bash-completion version="1">',
    ...completions.map((completion) =>
      [
        '<task>',
        messageXmlField('bash-id', completion.bashId),
        messageXmlField('description', completion.description),
        messageXmlField('command', completion.command),
        messageXmlField('directory', completion.directory),
        messageXmlField('status', formatBashCompletionStatus(completion)),
        messageXmlField('exit-code', completion.exitCode),
        messageXmlField('signal', completion.processSignal),
        messageXmlField('timed-out', completion.timedOut),
        messageXmlField('error', completion.errorMessage),
        messageXmlField('start-time', completion.startTime),
        messageXmlField('finished-at', completion.finishedAt),
        '</task>',
      ].join('\n'),
    ),
    '</background-bash-completion>',
  ].join('\n');
}
