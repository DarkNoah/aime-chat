import { ToolExecutionContext } from '@mastra/core/tools';
import z, { ZodSchema } from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import mastraManager from '@/main/mastra';
import { DEFAULT_RESOURCE_ID } from '@/types/chat';
import { projectManager } from '@/main/project';

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

type ListedThread = {
  thread: any;
  project?: {
    id: string;
    title: string;
  };
};

const toPlainText = (message: any): string => {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message?.parts)) {
    return message.parts.filter(p => p.type !== 'reasoning')
      .map((p: any) => {
        if (p?.type === 'text' && typeof p.text === 'string') return p.text;
        if (p?.type === 'reasoning' && typeof p.text === 'string') return `[reasoning] ${p.text}`;
        if (typeof p?.type === 'string' && p.type.startsWith('tool-')) {
          const name = p?.toolName ?? p.type.slice(5);
          const args = p?.input ? JSON.stringify(p.input).slice(0, 200) : '';
          const out = p?.output ? JSON.stringify(p.output).slice(0, 200) : '';
          return `[tool ${name}] in=${args} out=${out}`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(message?.content)) {
    return message.content
      .map((c: any) => (c?.type === 'text' ? c.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const isCronThread = (t: any) =>
  t?.metadata?.cron === true || typeof t?.metadata?.cronId === 'string';

const getThreadUpdatedMs = (t: any) => (t?.updatedAt ? new Date(t.updatedAt).getTime() : 0);

const formatThreadLine = (t: any) => {
  const title = t?.title ?? t?.metadata?.title ?? '(untitled)';
  const updated = t?.updatedAt ? new Date(t.updatedAt).toISOString() : '';
  return `- ${t.id} | ${truncate(String(title), 80)} | updated=${updated}`;
};

export class ChatHistoryList extends BaseTool {
  static readonly toolName = 'ChatHistoryList';
  id: string = 'ChatHistoryList';
  description = `List recent chat threads (real user conversations). Use this first when you need to ingest recent user activity into the global memory wiki.
By default, threads created by scheduled cron jobs are excluded so you never re-ingest your own runs.
Returns normal threads separately from project threads. Threads belonging to the same project are grouped together.`;

  inputSchema = z.object({
    since: z
      .string()
      .optional()
      .describe('ISO date or YYYY-MM-DD; only include threads updated at or after this time'),
    until: z
      .string()
      .optional()
      .describe('ISO date or YYYY-MM-DD; only include threads updated at or before this time'),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum number of threads to return'),
    // resourceId: z
    //   .string()
    //   .optional()
    //   .describe(`Resource id to scope to (default: ${DEFAULT_RESOURCE_ID})`),
    includeCron: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include threads created by cron jobs (metadata.cronId is present). Default false.'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _ctx: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { since, until, limit = 20, includeCron = false } = inputData;
    const sinceMs = since ? Date.parse(since) : undefined;
    const untilMs = until ? Date.parse(until) : undefined;

    const shouldIncludeThread = (t: any) => {
      if (!includeCron && isCronThread(t)) return false;
      const ts = getThreadUpdatedMs(t);
      if (sinceMs && ts < sinceMs) return false;
      if (untilMs && ts > untilMs) return false;
      return true;
    };

    const normalRes = await mastraManager.getThreads({
      page: 0,
      size: 200,
      resourceId: DEFAULT_RESOURCE_ID,
    });

    const listedThreads: ListedThread[] = (normalRes.items ?? [])
      .filter(shouldIncludeThread)
      .map((thread: any) => ({ thread }));

    const projectsRes = await projectManager.getList({ page: 0, size: 200, filter: undefined });
    const projectThreads = await Promise.all(
      (projectsRes.items ?? []).map(async (project: any): Promise<ListedThread[]> => {
        if (!project?.id) return [];
        const res = await mastraManager.getThreads({
          page: 0,
          size: 200,
          resourceId: `project:${project.id}`,
        });
        return (res.items ?? [])
          .filter(shouldIncludeThread)
          .map((thread: any) => ({
            thread,
            project: {
              id: project.id,
              title: project.title ?? project.id,
            },
          }));
      }),
    );

    listedThreads.push(...projectThreads.flat());

    const filtered = listedThreads
      .sort((a, b) => getThreadUpdatedMs(b.thread) - getThreadUpdatedMs(a.thread))
      .slice(0, limit);

    if (filtered.length === 0) return 'No chat threads in the given range.';

    const normalThreads = filtered.filter((item) => !item.project);
    const projectGroups = new Map<string, { title: string; threads: any[]; updatedMs: number }>();
    for (const item of filtered) {
      if (!item.project) continue;
      const group = projectGroups.get(item.project.id) ?? {
        title: item.project.title,
        threads: [],
        updatedMs: 0,
      };
      group.threads.push(item.thread);
      group.updatedMs = Math.max(group.updatedMs, getThreadUpdatedMs(item.thread));
      projectGroups.set(item.project.id, group);
    }

    const lines: string[] = [];
    if (normalThreads.length > 0) {
      lines.push('Normal threads:');
      lines.push(...normalThreads.map(({ thread }) => formatThreadLine(thread)));
    }

    const sortedProjectGroups = [...projectGroups.entries()].sort(
      ([, a], [, b]) => b.updatedMs - a.updatedMs,
    );
    if (sortedProjectGroups.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('Project threads:');
      for (const [projectId, group] of sortedProjectGroups) {
        lines.push(`Project: ${group.title} (${projectId})`);
        lines.push(...group.threads.map(formatThreadLine));
      }
    }

    return lines.join('\n');
  };
}

export class ChatHistoryRead extends BaseTool {
  static readonly toolName = 'ChatHistoryRead';
  id: string = 'ChatHistoryRead';
  description = `Read messages from a single chat thread by id. Returns plain text of user / assistant messages and brief tool-call summaries, oldest first. Use after ChatHistoryList to ingest a specific conversation. Cron-created threads are refused by default to prevent self-ingestion loops.`;

  inputSchema = z.object({
    threadId: z.string().min(1).describe('Thread id, as returned by ChatHistoryList'),
    limit: z
      .number()
      .optional()
      .default(80)
      .describe('Maximum number of messages to return (most recent N)'),
    since: z
      .string()
      .optional()
      .describe('ISO date or YYYY-MM-DD; only return messages created at or after this time. Use ingest_since from cron-context for delta ingest.'),
    includeTools: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include tool-call summaries in the output'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _ctx: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { threadId, limit = 80, since, includeTools = false } = inputData;
    const sinceMs = since ? Date.parse(since) : undefined;

    let messages: any[] = [];
    let threadMeta: any;
    try {
      const res = await mastraManager.getThreadMessages({
        threadId,
        perPage: limit,
        page: 0,
      });
      messages = res.messages ?? [];
      // Try to also detect cron threads via thread metadata
      try {
        const t = await mastraManager.getThread(threadId, true);
        threadMeta = t?.metadata;
      } catch {
        // ignore
      }
    } catch (err) {
      return `Failed to read thread "${threadId}": ${(err as Error)?.message ?? err}`;
    }


    if (!messages.length) return `Thread "${threadId}" has no messages.`;

    const lines: string[] = [];



    lines.push(`## CHAT THREAD META`);
    if (threadMeta?.resourceId.startsWith('project:')) {
      const project = await projectManager.getProject(threadMeta?.resourceId?.split(':')[1]);
      lines.push(`project: ${project?.title} (${project?.id})`);
    }
    lines.push(`title: ${threadMeta?.title}`);
    lines.push(`threadId: ${threadId}`);
    lines.push(`model: ${threadMeta?.model}`);
    lines.push(`createdAt: ${threadMeta?.createdAt}`);
    // lines.push('\n\n')

    lines.push(`## CHAT MESSAGES`);
    for (const m of messages) {
      const role = m?.role ?? 'unknown';
      if (!includeTools && role !== 'user' && role !== 'assistant' && role !== 'system') continue;
      if (sinceMs) {
        const ts = m?.metadata?.createdAt ? new Date(m.metadata.createdAt).getTime() : 0;
        if (ts < sinceMs) continue;
      }
      const text = toPlainText(m);
      if (!text.trim()) continue;
      const ts = m?.metadata?.createdAt ? new Date(m.metadata.createdAt).toISOString() : '';
      lines.push(`[${role}]\ncontent: \n${text}`);
    }

    if (lines.length === 0) {
      return since
        ? `Thread "${threadId}" has no readable messages since ${since}.`
        : `Thread "${threadId}" has no readable text content.`;
    }
    return lines.join('\n\n');
  };
}

export class ChatHistorySearch extends BaseTool {
  static readonly toolName = 'ChatHistorySearch';
  id: string = 'ChatHistorySearch';
  description = `Keyword search across recent chat threads. Returns matching message excerpts with their thread id and timestamp. Use this to find prior mentions of a person, project or topic before deciding whether to update an existing wiki page.`;

  inputSchema = z.object({
    query: z.string().min(1).describe('Case-insensitive keyword or phrase'),
    since: z
      .string()
      .optional()
      .describe('ISO date or YYYY-MM-DD; only search threads updated at or after this time'),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum number of matching excerpts to return'),
    threadLimit: z
      .number()
      .optional()
      .default(50)
      .describe('Maximum number of threads to scan'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _ctx: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { query, since, limit = 20, threadLimit = 50 } = inputData;
    const needle = query.toLowerCase();
    const sinceMs = since ? Date.parse(since) : undefined;

    const res = await mastraManager.getThreads({
      page: 0,
      size: threadLimit,
      resourceId: DEFAULT_RESOURCE_ID,
    });
    const threads = (res.items ?? []).filter((t: any) => {
      if (isCronThread(t)) return false;
      if (!sinceMs) return true;
      const ts = t?.updatedAt ? new Date(t.updatedAt).getTime() : 0;
      return ts >= sinceMs;
    });

    const results: string[] = [];
    for (const t of threads) {
      if (results.length >= limit) break;
      let messages: any[] = [];
      try {
        const r = await mastraManager.getThreadMessages({
          threadId: t.id,
          perPage: 200,
          page: 0,
        });
        messages = r.messages ?? [];
      } catch {
        continue;
      }
      for (const m of messages) {
        if (results.length >= limit) break;
        const text = toPlainText(m);
        if (!text) continue;
        const lower = text.toLowerCase();
        const idx = lower.indexOf(needle);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 60);
        const end = Math.min(text.length, idx + needle.length + 100);
        const excerpt = `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
        const ts = m?.createdAt ? new Date(m.createdAt).toISOString() : '';
        results.push(`[${t.id}] ${m?.role ?? '?'}${ts ? ` @ ${ts}` : ''}\n${excerpt}`);
      }
    }

    if (results.length === 0) return `No matches for "${query}".`;
    return results.join('\n\n---\n\n');
  };
}

class ChatHistoryToolkit extends BaseToolkit {
  static readonly toolName: string = 'ChatHistoryToolkit';
  id = 'ChatHistoryToolkit';
  constructor(params?: BaseToolkitParams) {
    super([new ChatHistoryList(), new ChatHistoryRead(), new ChatHistorySearch()], params);
  }

  getTools() {
    return this.tools;
  }
}
export default ChatHistoryToolkit;
