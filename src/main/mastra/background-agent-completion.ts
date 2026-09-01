import type { BackgroundAgentCompletion } from '../tools/common/background-agent';

export function formatAgentCompletionMessage(
  completions: BackgroundAgentCompletion[],
) {
  const lines = [
    completions.length === 1
      ? 'Background agent finished.'
      : `Background agents finished (${completions.length} agents).`,
    '',
  ];

  completions.forEach((completion, index) => {
    lines.push(
      `${index + 1}. Agent ID: ${completion.sessionId}`,
      '',
      `   Description: ${completion.description}`,
      '',
      `   Agent type: ${completion.subagentType}`,
      '',
      `   Status: ${completion.status}`,
      '',
      `   Result: ${completion.result || 'None'}`,
      '',
      `   Error: ${completion.errorMessage || 'None'}`,
    );
    if (index < completions.length - 1) lines.push('');
  });

  return lines.join('\n');
}
