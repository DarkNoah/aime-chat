import type {
  AgentCompletionMessageTask,
  StructuredMessageData,
} from '@/utils/structured-message';

// Historical notifications are plain text, with blank lines separating fields.
// Fall back to normal text when embedded output makes those boundaries ambiguous.
export function parseLegacyAgentCompletion(
  text: string,
): StructuredMessageData | null {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const header = normalized.match(
    /^Background agent finished\.\n\n|^Background agents finished \((\d+) agents\)\.\n\n/,
  );
  if (!header) return null;
  const count = header[1] ? Number(header[1]) : 1;
  const blocks = normalized
    .slice(header[0].length)
    .split(/\n\n(?=\d+\. Agent ID: )/);
  if (blocks.length !== count) return null;
  const agents: AgentCompletionMessageTask[] = [];
  const labels = ['Description', 'Agent type', 'Status', 'Result', 'Error'];
  for (const [index, block] of blocks.entries()) {
    const id = block.match(/^(\d+)\. Agent ID: ([^\n]+)\n\n/);
    if (!id || Number(id[1]) !== index + 1 || !id[2].trim()) return null;
    const fields: Record<string, string> = {};
    let remaining = block.slice(id[0].length);
    for (const [fieldIndex, label] of labels.entries()) {
      const prefix = `   ${label}: `;
      if (!remaining.startsWith(prefix)) return null;
      remaining = remaining.slice(prefix.length);
      const nextLabel = labels[fieldIndex + 1];
      if (!nextLabel) {
        fields[label] = remaining;
        break;
      }
      const separator = `\n\n   ${nextLabel}: `;
      const boundary = remaining.indexOf(separator);
      if (boundary < 0 || remaining.indexOf(separator, boundary + 1) !== -1)
        return null;
      fields[label] = remaining.slice(0, boundary);
      remaining = remaining.slice(boundary + 2);
    }
    if (
      !['completed', 'failed', 'aborted'].includes(fields.Status) ||
      !fields['Agent type']?.trim()
    )
      return null;
    agents.push({
      sessionId: id[2],
      description: fields.Description,
      subagentType: fields['Agent type'],
      status: fields.Status as AgentCompletionMessageTask['status'],
      result: fields.Result === 'None' ? undefined : fields.Result,
      errorMessage: fields.Error === 'None' ? undefined : fields.Error,
    });
  }
  return agents.length ? { type: 'background-agent-completion', agents } : null;
}
