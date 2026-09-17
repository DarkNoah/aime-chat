import type { BackgroundAgentCompletion } from '../tools/common/background-agent';
import { messageXmlField } from '@/utils/structured-message';

export function formatAgentCompletionMessage(
  completions: BackgroundAgentCompletion[],
) {
  return [
    '<background-agent-completion version="1">',
    ...completions.map((completion) =>
      [
        '<agent>',
        messageXmlField('agent-id', completion.sessionId),
        messageXmlField('description', completion.description),
        messageXmlField('agent-type', completion.subagentType),
        messageXmlField('status', completion.status),
        messageXmlField('result', completion.result),
        messageXmlField('error', completion.errorMessage),
        messageXmlField('start-time', completion.startTime),
        messageXmlField('finished-at', completion.finishedAt),
        '</agent>',
      ].join('\n'),
    ),
    '</background-agent-completion>',
  ].join('\n');
}
