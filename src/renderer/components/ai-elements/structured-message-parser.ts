import type {
  BashCompletionMessageTask,
  StructuredMessageData,
} from '@/utils/structured-message';

export const isStructuredMessageXml = (text: string) =>
  /^<(?:background-bash-completion|cron-context)(?:\s|>)/.test(text.trim());

// Only direct text fields are accepted. Nested markup is never rendered as HTML.
function readFields(element: Element): Record<string, string> | null {
  const fields: Record<string, string> = Object.create(null);
  for (const child of Array.from(element.children)) {
    if (child.children.length || Object.hasOwn(fields, child.tagName)) {
      return null;
    }
    fields[child.tagName] = child.textContent ?? '';
  }
  return fields;
}

function parseTask(element: Element): BashCompletionMessageTask | null {
  if (element.tagName !== 'task') return null;
  const fields = readFields(element);
  if (
    !fields?.['bash-id']?.trim() ||
    !fields.command?.trim() ||
    !['true', 'false'].includes(fields['timed-out'])
  ) {
    return null;
  }
  const exitCode = fields['exit-code']?.trim() || '';
  if (
    exitCode &&
    (!/^-?\d+$/.test(exitCode) || !Number.isSafeInteger(Number(exitCode)))
  ) {
    return null;
  }
  return {
    bashId: fields['bash-id'],
    command: fields.command,
    description: fields.description,
    directory: fields.directory,
    exitCode: exitCode ? Number(exitCode) : null,
    processSignal: fields.signal || null,
    timedOut: fields['timed-out'] === 'true',
    errorMessage: fields.error,
    startTime: fields['start-time'] || '',
    finishedAt: fields['finished-at'] || '',
  };
}

function parseSkillCommand(text: string): StructuredMessageData | null {
  const match = text.match(/^\/(skill:[^\s:]+(?::[^\s:]+)*)(?=\s|$)([\s\S]*)$/);
  if (!match) return null;
  const [, id, args] = match;
  return {
    type: 'skill',
    skill: {
      id,
      name: id.split(':').pop() || id,
      args: args || undefined,
    },
  };
}

function parseCronMessage(text: string): StructuredMessageData | null {
  const closingTag = '</cron-context>';
  const closingIndex = text.indexOf(closingTag);
  if (closingIndex < 0) return null;
  const context = text.slice(0, closingIndex + closingTag.length);
  const prompt = text
    .slice(closingIndex + closingTag.length)
    .replace(/^\r?\n/, '');
  let fields: Record<string, string> | null;
  if (context.startsWith('<cron-context>')) {
    // Historical messages contain plain key/value lines inside the context block.
    const lines = context
      .slice('<cron-context>'.length, -closingTag.length)
      .replace(/^\r?\n/, '')
      .split(/\r?\n/);
    const keys = [
      'cron_id',
      'cron_name',
      'started_at',
      'previous_run_at',
      'ingest_since',
    ];
    if (lines[keys.length] !== '' || lines[keys.length + 1] !== 'Notes:')
      return null;
    fields = Object.create(null);
    for (const [index, key] of keys.entries()) {
      const prefix = `${key}: `;
      if (!lines[index]?.startsWith(prefix)) return null;
      fields[key] = lines[index].slice(prefix.length);
    }
  } else {
    if (/<!DOCTYPE|<!ENTITY|<\?/i.test(context)) return null;
    const document = new DOMParser().parseFromString(
      context,
      'application/xml',
    );
    if (document.querySelector('parsererror')) return null;
    const root = document.documentElement;
    if (root.tagName !== 'cron-context' || root.getAttribute('version') !== '1')
      return null;
    fields = readFields(root);
    if (!fields || !['schedule', 'manual'].includes(fields.trigger))
      return null;
  }
  if (
    !fields.cron_id?.trim() ||
    !fields.cron_name?.trim() ||
    !fields.started_at?.trim() ||
    !fields.ingest_since?.trim()
  )
    return null;
  return {
    type: 'cron',
    cron: {
      id: fields.cron_id,
      name: fields.cron_name,
      trigger: fields.trigger as 'schedule' | 'manual' | undefined,
      startedAt: fields.started_at,
      previousRunAt:
        fields.previous_run_at === '(none)'
          ? undefined
          : fields.previous_run_at,
      ingestSince: fields.ingest_since,
      prompt,
    },
  };
}

export function parseStructuredMessage(
  text: string,
): StructuredMessageData | null {
  const trimmed = text.trim();
  if (/^<cron-context(?:\s|>)/.test(trimmed))
    return parseCronMessage(text.trimStart());
  if (!isStructuredMessageXml(trimmed))
    return parseSkillCommand(text.trimStart());
  // No declarations, external entities, or processing instructions in this format.
  if (/<!DOCTYPE|<!ENTITY|<\?/i.test(trimmed)) return null;
  const document = new DOMParser().parseFromString(trimmed, 'application/xml');
  if (document.querySelector('parsererror')) return null;
  const root = document.documentElement;
  if (root.getAttribute('version') !== '1') return null;

  if (root.tagName === 'background-bash-completion') {
    const tasks = Array.from(root.children).map(parseTask);
    if (!tasks.length || tasks.some((task) => task === null)) return null;
    return {
      type: 'background-bash-completion',
      tasks: tasks as BashCompletionMessageTask[],
    };
  }
  return null;
}
