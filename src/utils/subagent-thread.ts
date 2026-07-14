export function getSubAgentThreadId(toolCallId: string): string {
  const normalizedToolCallId = toolCallId?.trim();
  if (!normalizedToolCallId) {
    throw new Error('toolCallId is required');
  }

  return `subagent:${normalizedToolCallId}`;
}
