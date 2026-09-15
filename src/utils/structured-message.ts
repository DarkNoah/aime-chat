export type BashCompletionMessageTask = {
  bashId: string;
  command: string;
  description?: string;
  directory?: string;
  exitCode?: number | null;
  processSignal?: string | null;
  timedOut: boolean;
  errorMessage?: string;
  startTime: string;
  finishedAt: string;
};

export type SkillMessageData = {
  id: string;
  name: string;
  // Keep the text following the command, including whitespace and line breaks.
  args?: string;
};

export type CronMessageData = {
  id: string;
  name: string;
  trigger?: 'schedule' | 'manual';
  startedAt: string;
  previousRunAt?: string;
  ingestSince: string;
  prompt: string;
};

export type StructuredMessageData =
  | { type: 'background-bash-completion'; tasks: BashCompletionMessageTask[] }
  | { type: 'skill'; skill: SkillMessageData }
  | { type: 'cron'; cron: CronMessageData };

// Text nodes keep shell commands separate from XML markup.
export function escapeMessageXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;');
}

export function messageXmlField(
  name: string,
  value: string | number | boolean | null | undefined,
) {
  return `<${name}>${escapeMessageXml(String(value ?? ''))}</${name}>`;
}

export function getBashCompletionState(task: BashCompletionMessageTask) {
  if (task.timedOut) return 'timed-out';
  if (task.processSignal) return 'terminated';
  if (task.exitCode === 0) return 'succeeded';
  if (typeof task.exitCode === 'number') return 'failed';
  if (task.errorMessage) return 'error';
  return 'completed';
}
