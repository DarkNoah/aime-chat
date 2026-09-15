import { messageXmlField } from '@/utils/structured-message';

export function formatCronMessage({
  id,
  name,
  prompt,
  trigger,
  startedAt,
  previousRunAt,
}: {
  id: string;
  name: string;
  prompt: string;
  trigger: 'schedule' | 'manual';
  startedAt: Date;
  previousRunAt?: Date;
}): string {
  const ingestSince =
    previousRunAt ?? new Date(startedAt.getTime() - 24 * 60 * 60 * 1000);
  const notes = [
    '- This conversation was started by a scheduled cron job, not by the user. Do not ingest this thread itself or any other thread whose metadata.cronId is present.',
    '- When using ChatHistoryList / ChatHistorySearch, pass since=ingest_since so you only process new activity since the previous run.',
    '- ChatHistoryList already filters out cron-created threads by default; do not set includeCron unless explicitly asked.',
  ].join('\n');
  return [
    '<cron-context version="1">',
    messageXmlField('cron_id', id),
    messageXmlField('cron_name', name),
    messageXmlField('trigger', trigger),
    messageXmlField('started_at', startedAt.toISOString()),
    messageXmlField(
      'previous_run_at',
      previousRunAt?.toISOString() ?? '(none)',
    ),
    messageXmlField('ingest_since', ingestSince.toISOString()),
    messageXmlField('notes', notes),
    '</cron-context>',
    prompt,
  ].join('\n');
}
