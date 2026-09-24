import type { UIMessage } from 'ai';

type BashReminderSession = {
  bashId: string;
  command: string;
  isExited: boolean;
};

// Match only the complete part generated here, including legacy reminders.
// Other system reminders and user text mentioning Background Bash are retained.
const BASH_REMINDER =
  /^<system-reminder>\n(?:Background Bash \S+ \(command: [\s\S]*?\) \(status: (?:exited|running)\) Has new output available\. You can check its output using the BashOutput tool\.\n)+<\/system-reminder>$/;

/** Refresh the latest message's reminder without mutating retry input/history. */
export function withBackgroundBashReminder(
  messages: UIMessage[],
  updatedSessions: BashReminderSession[],
): UIMessage[] {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return messages;

  const parts = lastMessage.parts.filter(
    (part) => part.type !== 'text' || !BASH_REMINDER.test(part.text),
  );
  if (updatedSessions.length > 0 && parts.at(-1)?.type === 'text') {
    const reminders = updatedSessions.map(
      (session) =>
        `Background Bash ${session.bashId} (command: ${session.command}) (status: ${session.isExited ? 'exited' : 'running'}) Has new output available. You can check its output using the BashOutput tool.`,
    );
    parts.push({
      type: 'text',
      text: `<system-reminder>\n${reminders.join('\n')}\n</system-reminder>`,
    });
  }

  return [...messages.slice(0, -1), { ...lastMessage, parts }];
}
