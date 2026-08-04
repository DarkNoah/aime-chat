export const MIN_COMPACT_HISTORY_MESSAGES = 5;

export function countCompactHistoryMessages(
  messages: ReadonlyArray<{ role?: string }>,
): number {
  return messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  ).length;
}

export class CompactHistoryTooShortError extends Error {
  constructor(messageCount: number) {
    super(
      `压缩失败：至少需要 ${MIN_COMPACT_HISTORY_MESSAGES} 条用户或助手历史消息，当前只有 ${messageCount} 条。`,
    );
    this.name = 'CompactHistoryTooShortError';
  }
}
