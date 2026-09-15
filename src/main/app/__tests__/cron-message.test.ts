import { formatCronMessage } from '../cron-message';

const startedAt = new Date('2026-09-15T01:00:00.000Z');
const options = {
  id: 'cron-1',
  name: '日报',
  prompt: '整理昨天的项目进展。',
  trigger: 'schedule' as const,
  startedAt,
};

it('keeps the initial 24-hour ingestion window and full task prompt', () => {
  const prompt = '\n整理 <报告> & 检查图片\r\n</cron-context>\n';
  const message = formatCronMessage({ ...options, prompt });
  expect(message).toContain(
    '<ingest_since>2026-09-14T01:00:00.000Z</ingest_since>',
  );
  expect(message).toContain('<previous_run_at>(none)</previous_run_at>');
  expect(message).toContain('<trigger>schedule</trigger>');
  expect(message.endsWith(`</cron-context>\n${prompt}`)).toBe(true);
  expect(message).toContain('pass since=ingest_since');
  expect(message).toContain('Do not ingest this thread itself');
  expect(message).toContain('do not set includeCron unless explicitly asked');
});

it('preserves the prior run boundary and manual trigger', () => {
  const previousRunAt = new Date('2026-09-10T09:30:00.000Z');
  const message = formatCronMessage({
    ...options,
    trigger: 'manual',
    previousRunAt,
  });
  expect(message).toContain('<trigger>manual</trigger>');
  expect(message).toContain(
    `<previous_run_at>${previousRunAt.toISOString()}</previous_run_at>`,
  );
  expect(message).toContain(
    `<ingest_since>${previousRunAt.toISOString()}</ingest_since>`,
  );
});

it('escapes task metadata so it cannot break the XML context', () => {
  const name = 'A & B </cron-context> "日报"\r\n第二行';
  const message = formatCronMessage({ ...options, name });
  const context = message.slice(
    0,
    message.indexOf('</cron-context>') + '</cron-context>'.length,
  );
  const document = new DOMParser().parseFromString(context, 'application/xml');
  expect(document.querySelector('parsererror')).toBeNull();
  expect(document.querySelector('cron_name')?.textContent).toBe(name);
  expect(document.documentElement.getAttribute('version')).toBe('1');
});
