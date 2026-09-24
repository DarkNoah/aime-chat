import type { UIMessage } from 'ai';
import { withBackgroundBashReminder } from '../background-bash-reminder';

const session = { bashId: 'bash-1', command: 'npm test', isExited: false };
const message = (): UIMessage => ({
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Run the tests' }],
});
const reminder = (command = session.command, status = 'running') => ({
  type: 'text' as const,
  text: `<system-reminder>\nBackground Bash bash-1 (command: ${command}) (status: ${status}) Has new output available. You can check its output using the BashOutput tool.\n</system-reminder>`,
});

describe('Background Bash reminder on retry', () => {
  it('does not mutate pending input reused after a failed request', () => {
    const pending = message();
    Object.freeze(pending.parts);
    Object.freeze(pending);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(withBackgroundBashReminder([pending], [session])[0].parts).toEqual(
        [...pending.parts, reminder()],
      );
    }
    expect(pending).toEqual(message());
  });

  it('replaces duplicates loaded from history and remains idempotent', () => {
    const history = [
      { ...message(), parts: [...message().parts, reminder(), reminder()] },
    ];
    const snapshot = JSON.parse(JSON.stringify(history));
    let input = history;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      input = withBackgroundBashReminder(input, [session]);
      expect(input[0].parts).toEqual([...message().parts, reminder()]);
    }
    expect(history).toEqual(snapshot);
  });

  it('refreshes status and the session set, including multiline commands', () => {
    const multiline = { ...session, command: 'echo first\necho second' };
    const second = { ...session, bashId: 'bash-2' };
    const initial = withBackgroundBashReminder(
      [message()],
      [multiline, second],
    );
    expect(initial[0].parts).toHaveLength(2);
    const updated = withBackgroundBashReminder(initial, [
      { ...session, isExited: true },
    ]);
    expect(updated[0].parts).toEqual([
      ...message().parts,
      reminder('npm test', 'exited'),
    ]);
    expect(withBackgroundBashReminder(updated, [])[0].parts).toEqual(
      message().parts,
    );
  });

  it('preserves unrelated reminders, user text, files, metadata and earlier messages', () => {
    const earlier = { ...message(), parts: [...message().parts, reminder()] };
    const latest: UIMessage = {
      ...message(),
      id: 'user-2',
      metadata: { custom: true },
      parts: [
        {
          type: 'file',
          mediaType: 'image/png',
          url: 'data:image/png;base64,AA==',
        },
        {
          type: 'text',
          text: '<system-reminder>Continue the task.</system-reminder>',
        },
        { type: 'text', text: `Please explain this:\n${reminder().text}` },
      ],
    };
    const result = withBackgroundBashReminder([earlier, latest], [session]);
    expect(result[0]).toBe(earlier);
    expect(result[1]).toEqual({
      ...latest,
      parts: [...latest.parts, reminder()],
    });
  });

  it('handles empty messages and retains the non-text tail guard', () => {
    expect(withBackgroundBashReminder([], [session])).toEqual([]);
    const empty = { ...message(), parts: [] };
    expect(withBackgroundBashReminder([empty], [session])).toEqual([empty]);
    const tool: UIMessage = {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-BashOutput',
          toolCallId: 'call-1',
          state: 'input-available',
          input: {},
        },
      ],
    };
    expect(withBackgroundBashReminder([tool], [session])).toEqual([tool]);
  });
});
