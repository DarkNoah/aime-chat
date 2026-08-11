import { MessageList } from '@mastra/core/agent/message-list';
import type { ModelMessage, UIMessage } from 'ai';
import * as XLSX from 'xlsx';
import type { Project, ProjectChatExportFormat } from '@/types/project';

export type ProjectChatExportThread = {
  thread: {
    id: string;
    title?: string;
    resourceId?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    [key: string]: any;
  };
  messages: UIMessage[];
  rawMessages: Array<{
    id: string;
    role: string;
    createdAt?: Date | string;
    [key: string]: any;
  }>;
};

export type ProjectChatExportArtifact = {
  content: string | Buffer;
  messageCount: number;
};

const TRAINING_NOISE = [
  /^\[Request interrupted by user\]$/i,
  /^\[请求已被用户中断\]$/,
];

const safeJson = (value: unknown, indentation?: number): string => {
  try {
    return JSON.stringify(value, null, indentation) ?? String(value);
  } catch {
    return String(value);
  }
};

const formatDate = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const getPartText = (
  part: any,
  options: { includeReasoning: boolean; includeTools: boolean },
): string => {
  if (!part || typeof part !== 'object') return '';
  if (part.type === 'text' && typeof part.text === 'string') return part.text;
  if (part.type === 'reasoning') {
    if (!options.includeReasoning || typeof part.text !== 'string') return '';
    return `[reasoning]\n${part.text}`;
  }
  if (part.type === 'file') {
    const name = part.filename || part.name || part.url || 'attachment';
    return `[file] ${name}`;
  }
  if (part.type === 'source-url') {
    return `[source] ${part.title || part.url || ''}`.trim();
  }
  if (
    options.includeTools &&
    typeof part.type === 'string' &&
    (part.type.startsWith('tool-') || part.type === 'dynamic-tool')
  ) {
    return `[${part.type}]\n${safeJson(part, 2)}`;
  }
  return '';
};

export const messageToText = (
  message: any,
  options: { includeReasoning?: boolean; includeTools?: boolean } = {},
): string => {
  const normalizedOptions = {
    includeReasoning: options.includeReasoning ?? true,
    includeTools: options.includeTools ?? true,
  };
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.parts)) {
    return message.parts
      .map((part: any) => getPartText(part, normalizedOptions))
      .filter(Boolean)
      .join('\n\n');
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part: any) => getPartText(part, normalizedOptions))
      .filter(Boolean)
      .join('\n\n');
  }
  if (Array.isArray(message.content?.parts)) {
    return message.content.parts
      .map((part: any) => getPartText(part, normalizedOptions))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
};

const stripTrainingNoise = (value: string): string =>
  value.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

const getMessageCreatedAt = (message: any, rawMessage?: any): string =>
  formatDate(
    message?.metadata?.createdAt ||
      message?.createdAt ||
      rawMessage?.createdAt ||
      rawMessage?.created_at,
  );

const getRawMessageMap = (messages: ProjectChatExportThread['rawMessages']) =>
  new Map(messages.map((message) => [message.id, message]));

const buildModelMessages = (
  rawMessages: ProjectChatExportThread['rawMessages'],
): ModelMessage[] =>
  new MessageList()
    .add(rawMessages as any, 'memory')
    .get.all.aiV5.model() as ModelMessage[];

const buildMarkdown = (
  project: Project,
  threads: ProjectChatExportThread[],
  exportedAt: string,
): string => {
  const lines = [
    `# ${project.title || project.id || 'Project'} chat history`,
    '',
    `- Project ID: ${project.id || ''}`,
    `- Exported at: ${exportedAt}`,
    `- Threads: ${threads.length}`,
    '',
  ];

  threads.forEach(({ thread, messages, rawMessages }, threadIndex) => {
    const rawById = getRawMessageMap(rawMessages);
    lines.push(`## ${threadIndex + 1}. ${thread.title || 'Untitled thread'}`);
    lines.push('');
    lines.push(`- Thread ID: ${thread.id}`);
    lines.push(`- Created at: ${formatDate(thread.createdAt)}`);
    lines.push(`- Updated at: ${formatDate(thread.updatedAt)}`);
    lines.push('');

    messages.forEach((message: any) => {
      const raw = rawById.get(message.id);
      const role = String(message.role || raw?.role || 'unknown');
      const createdAt = getMessageCreatedAt(message, raw);
      const text = messageToText(message).trim();
      lines.push(`### ${role}${createdAt ? ` · ${createdAt}` : ''}`);
      lines.push('');
      lines.push(text || '_(No readable text content)_');
      lines.push('');
    });
  });

  return `${lines.join('\n').trim()}\n`;
};

const buildRawJson = (
  project: Project,
  threads: ProjectChatExportThread[],
  exportedAt: string,
): string =>
  `${JSON.stringify(
    {
      schemaVersion: 2,
      exportedAt,
      project: {
        id: project.id,
        title: project.title,
        path: project.path,
      },
      threads: threads.map(({ thread, rawMessages }) => ({
        thread,
        messages: rawMessages,
        modelMessages: buildModelMessages(rawMessages),
      })),
    },
    null,
    2,
  )}\n`;

type TrainingToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: unknown;
  };
};

type TrainingMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string;
      tool_calls?: TrainingToolCall[];
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
      name: string;
    };

const mergeAdjacentTrainingText = (
  messages: TrainingMessage[],
): TrainingMessage[] => {
  const merged: TrainingMessage[] = [];
  messages.forEach((message) => {
    const previous = merged.at(-1);
    if (message.role === 'user' && previous?.role === 'user') {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else if (
      message.role === 'assistant' &&
      !message.tool_calls &&
      previous?.role === 'assistant' &&
      !previous.tool_calls
    ) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push(message);
    }
  });
  return merged;
};

const normalizeToolArguments = (value: unknown): unknown => {
  if (typeof value !== 'string') return value ?? {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toolOutputToText = (output: unknown): string => {
  if (
    output &&
    typeof output === 'object' &&
    'value' in output &&
    typeof (output as { type?: unknown }).type === 'string'
  ) {
    const { value } = output as { value: unknown };
    return typeof value === 'string' ? value : safeJson(value);
  }
  return typeof output === 'string' ? output : safeJson(output);
};

const getTrainingText = (message: unknown): string =>
  stripTrainingNoise(
    messageToText(message, {
      includeReasoning: false,
      includeTools: false,
    }),
  );

const isTrainingText = (content: string): boolean =>
  Boolean(content) && !TRAINING_NOISE.some((pattern) => pattern.test(content));

const buildTrainingMessages = (
  rawMessages: ProjectChatExportThread['rawMessages'],
): TrainingMessage[] => {
  const messages = buildModelMessages(rawMessages) as any[];
  const systemMessages = messages.flatMap((message) => {
    if (message?.role !== 'system') return [];
    const content = getTrainingText(message);
    return isTrainingText(content) ? [content] : [];
  });
  const conversation: TrainingMessage[] = [];
  const firstUserIndex = messages.findIndex(
    (message) =>
      message?.role === 'user' && isTrainingText(getTrainingText(message)),
  );
  const conversationMessages =
    firstUserIndex >= 0 ? messages.slice(firstUserIndex) : [];
  const toolPairs = new Map<
    string,
    {
      call: any;
      firstResult?: any;
      finalResult?: any;
      segment: number;
    }
  >();
  let toolSegment = 0;

  conversationMessages.forEach((message) => {
    const startsNewSegment =
      message?.role === 'user' ||
      message?.role === 'system' ||
      (message?.role === 'assistant' &&
        isTrainingText(getTrainingText(message)));
    if (startsNewSegment) toolSegment += 1;
    if (!Array.isArray(message?.content)) return;
    message.content.forEach((part: any) => {
      if (
        message.role === 'assistant' &&
        part?.type === 'tool-call' &&
        part.toolCallId
      ) {
        const toolCallId = String(part.toolCallId);
        if (!toolPairs.has(toolCallId)) {
          toolPairs.set(toolCallId, { call: part, segment: toolSegment });
        }
      } else if (
        (message.role === 'assistant' || message.role === 'tool') &&
        part?.type === 'tool-result' &&
        part.toolCallId
      ) {
        const toolCallId = String(part.toolCallId);
        const pair = toolPairs.get(toolCallId);
        if (pair?.segment === toolSegment) {
          pair.firstResult ??= part;
          pair.finalResult = part;
        }
      }
    });
  });

  const selectedToolCalls = new Set<any>();
  const selectedToolResults = new Map<any, any>();
  toolPairs.forEach((pair) => {
    if (pair.firstResult && pair.finalResult) {
      selectedToolCalls.add(pair.call);
      selectedToolResults.set(pair.firstResult, pair.finalResult);
    }
  });

  const appendToolResults = (parts: any[]) => {
    parts.forEach((part) => {
      const result = selectedToolResults.get(part);
      if (result) {
        conversation.push({
          role: 'tool',
          content: toolOutputToText(result.output ?? result.result),
          tool_call_id: String(result.toolCallId),
          name: String(result.toolName || result.name || 'tool'),
        });
      }
    });
  };

  for (const message of conversationMessages) {
    const role = message?.role;
    if (role === 'user') {
      const content = getTrainingText(message);
      if (isTrainingText(content)) {
        conversation.push({ role, content });
      }
    } else if (role === 'assistant') {
      const content = getTrainingText(message);
      const parts = Array.isArray(message.content) ? message.content : [];
      const toolCalls: TrainingToolCall[] = parts.flatMap((part: any) => {
        if (!selectedToolCalls.has(part)) {
          return [];
        }
        return [
          {
            id: String(part.toolCallId),
            type: 'function' as const,
            function: {
              name: String(part.toolName || part.name || 'tool'),
              arguments: normalizeToolArguments(part.input ?? part.args),
            },
          },
        ];
      });
      if (isTrainingText(content) || toolCalls.length > 0) {
        conversation.push({
          role: 'assistant',
          content: isTrainingText(content) ? content : '',
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      }
      appendToolResults(parts);
    } else if (role === 'tool' && Array.isArray(message.content)) {
      appendToolResults(message.content as any[]);
    }
  }

  while (conversation[0] && conversation[0].role !== 'user') {
    conversation.shift();
  }
  while (conversation.at(-1)?.role === 'user') conversation.pop();
  const normalizedConversation = mergeAdjacentTrainingText(conversation);

  if (
    !normalizedConversation.some((message) => message.role === 'user') ||
    !normalizedConversation.some((message) => message.role === 'assistant')
  ) {
    return [];
  }

  return systemMessages.length > 0
    ? [
        { role: 'system', content: systemMessages.join('\n\n') },
        ...normalizedConversation,
      ]
    : normalizedConversation;
};

const buildUnslothJsonl = (
  threads: ProjectChatExportThread[],
): { content: string; messageCount: number } => {
  let messageCount = 0;
  const lines = threads.flatMap(({ rawMessages }) => {
    const trainingMessages = buildTrainingMessages(rawMessages);
    if (trainingMessages.length === 0) return [];
    messageCount += trainingMessages.length;
    return [JSON.stringify({ messages: trainingMessages })];
  });
  return {
    content: lines.length > 0 ? `${lines.join('\n')}\n` : '',
    messageCount,
  };
};

const EXCEL_CELL_LENGTH = 32_000;

const splitExcelValue = (
  key: string,
  value: string,
): Record<string, string> => {
  if (value.length <= EXCEL_CELL_LENGTH) return { [key]: value };
  const output: Record<string, string> = {};
  for (let offset = 0, index = 1; offset < value.length; index += 1) {
    output[`${key}_${index}`] = value.slice(offset, offset + EXCEL_CELL_LENGTH);
    offset += EXCEL_CELL_LENGTH;
  }
  return output;
};

const buildXlsx = (
  project: Project,
  threads: ProjectChatExportThread[],
): Buffer => {
  const threadRows = threads.map(({ thread, rawMessages }) => ({
    project_id: project.id || '',
    project_title: project.title || '',
    thread_id: thread.id,
    thread_title: thread.title || '',
    created_at: formatDate(thread.createdAt),
    updated_at: formatDate(thread.updatedAt),
    message_count: rawMessages.length,
  }));
  const messageRows = threads.flatMap(({ thread, messages, rawMessages }) => {
    const messageById = new Map(
      messages.map((message: any) => [message.id, message]),
    );
    return rawMessages.map((raw) => {
      const message: any = messageById.get(raw.id);
      return {
        thread_id: thread.id,
        thread_title: thread.title || '',
        message_id: message?.id || raw.id || '',
        role: message?.role || raw.role || '',
        created_at: getMessageCreatedAt(message, raw),
        ...splitExcelValue('content', messageToText(message || raw)),
        ...splitExcelValue('raw_json', safeJson(raw)),
      };
    });
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(threadRows),
    'Threads',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(messageRows),
    'Messages',
  );
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
};

export const createProjectChatExport = (
  format: ProjectChatExportFormat,
  project: Project,
  threads: ProjectChatExportThread[],
  exportedAt = new Date().toISOString(),
): ProjectChatExportArtifact => {
  const rawMessageCount = threads.reduce(
    (count, thread) => count + thread.rawMessages.length,
    0,
  );
  if (format === 'markdown') {
    return {
      content: buildMarkdown(project, threads, exportedAt),
      messageCount: rawMessageCount,
    };
  }
  if (format === 'json') {
    return {
      content: buildRawJson(project, threads, exportedAt),
      messageCount: rawMessageCount,
    };
  }
  if (format === 'xlsx') {
    return {
      content: buildXlsx(project, threads),
      messageCount: rawMessageCount,
    };
  }
  const unsloth = buildUnslothJsonl(threads);
  return {
    content: unsloth.content,
    messageCount: unsloth.messageCount,
  };
};
