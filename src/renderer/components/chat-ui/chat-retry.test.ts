import type { UIMessage } from 'ai';
import { shouldShowManualRetry } from './chat-retry';

const reasoning: UIMessage['parts'][number] = {
  type: 'reasoning',
  text: 'Thinking about the request',
};
const answer: UIMessage['parts'][number] = { type: 'text', text: 'Answer' };
const reminder: UIMessage['parts'][number] = {
  type: 'text',
  text: ' \n<system-reminder>Internal context</system-reminder>\n',
};
const assistant = (parts: UIMessage['parts']): UIMessage => ({
  id: 'assistant',
  role: 'assistant',
  parts,
});

describe('shouldShowManualRetry', () => {
  it.each(['ready', 'error'] as const)(
    'shows retry after reasoning followed by reminders when %s',
    (status) => {
      expect(
        shouldShowManualRetry(
          [assistant([answer, reasoning, reminder, reminder])],
          status,
        ),
      ).toBe(true);
    },
  );

  it('keeps retry hidden after an answer followed by a reminder', () => {
    expect(
      shouldShowManualRetry(
        [assistant([reasoning, answer, reminder])],
        'ready',
      ),
    ).toBe(false);
  });

  it.each(['streaming', 'submitted'] as const)(
    'keeps retry hidden while %s',
    (status) => {
      expect(
        shouldShowManualRetry([assistant([reasoning, reminder])], status),
      ).toBe(false);
    },
  );

  it.each(['user', 'assistant'] as const)(
    'ignores a separate reminder-only %s message',
    (role) => {
      const reminderMessage: UIMessage = {
        id: 'reminder',
        role,
        parts: [reminder],
      };
      expect(
        shouldShowManualRetry(
          [assistant([reasoning]), reminderMessage],
          'ready',
        ),
      ).toBe(true);
      expect(
        shouldShowManualRetry([assistant([answer]), reminderMessage], 'ready'),
      ).toBe(false);
      expect(shouldShowManualRetry([reminderMessage], 'ready')).toBe(false);
    },
  );

  it('ignores messages marked as system reminders', () => {
    expect(
      shouldShowManualRetry(
        [
          assistant([answer]),
          {
            id: 'reminder',
            role: 'user',
            parts: [answer],
            metadata: { systemReminder: true },
          },
        ],
        'ready',
      ),
    ).toBe(false);
  });

  it('preserves real user input alongside a reminder', () => {
    expect(
      shouldShowManualRetry(
        [{ id: 'user', role: 'user', parts: [reminder, answer] }],
        'ready',
      ),
    ).toBe(true);
  });

  it.each(['data-tool-call-approval', 'data-tool-call-suspended'])(
    'keeps retry hidden for %s followed by a reminder',
    (type) => {
      const message = assistant([
        {
          type: 'tool-test',
          toolCallId: 'call-1',
          state: 'input-available',
          input: {},
        },
        { type, data: { toolCallId: 'call-1' } } as UIMessage['parts'][number],
        reminder,
      ]);
      expect(shouldShowManualRetry([message], 'ready')).toBe(false);
    },
  );
});
