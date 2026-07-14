import type { SSHSessionSummary, SSHTarget } from './manager';

const escapeReminderText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const formatTarget = (target: SSHTarget) => {
  if (target.type === 'config') return `config:${target.name}`;
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  return `direct:${target.username ? `${target.username}@` : ''}${host}:${target.port ?? 22}`;
};

export function buildSSHConnectionsReminder(
  sessions: SSHSessionSummary[],
): string | undefined {
  const activeSessions = sessions.filter(
    (session) => session.state === 'running',
  );
  if (activeSessions.length === 0) return undefined;

  const connections = activeSessions
    .map((session) => {
      const connectionId = escapeReminderText(session.connectionId);
      const target = escapeReminderText(formatTarget(session.target));
      return `- SSH ${connectionId} (target: ${target}) (status: running). Use SSHInput or SSHOutput with connection_id "${connectionId}", or SSHTransfer to upload/download files. Use SSHConnection with action "close" and the same connection_id to close it.`;
    })
    .join('\n');

  return `<system-reminder>
The following application-wide SSH connections are currently active:
${connections}
</system-reminder>`;
}
