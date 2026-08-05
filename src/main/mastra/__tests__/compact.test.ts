import {
  CompactHistoryTooShortError,
  countCompactHistoryMessages,
  MIN_COMPACT_HISTORY_MESSAGES,
} from '../compact';

describe('manual compact history validation', () => {
  it('counts only persisted user and assistant messages', () => {
    expect(
      countCompactHistoryMessages([
        { role: 'system' },
        { role: 'user' },
        { role: 'assistant' },
        { role: 'tool' },
        { role: 'user' },
      ]),
    ).toBe(3);
  });

  it('requires five user or assistant history messages', () => {
    expect(MIN_COMPACT_HISTORY_MESSAGES).toBe(5);
    expect(new CompactHistoryTooShortError(4).message).toContain(
      '当前只有 4 条',
    );
  });
});
