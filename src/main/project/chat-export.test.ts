import { TransformStream as NodeTransformStream } from 'node:stream/web';
import * as XLSX from 'xlsx';

Object.defineProperty(window, 'TransformStream', {
  configurable: true,
  value: NodeTransformStream,
  writable: true,
});

const { createProjectChatExport } =
  jest.requireActual<typeof import('./chat-export')>('./chat-export');

const project = { id: 'project-1', title: 'Example project', path: '/tmp/p' };
const thread = {
  id: 'thread-1',
  title: 'First thread',
  resourceId: 'project:project-1',
  createdAt: new Date('2026-08-10T10:00:00.000Z'),
  updatedAt: new Date('2026-08-10T11:00:00.000Z'),
};
const rawMessages = [
  {
    id: 'user-1',
    threadId: 'thread-1',
    resourceId: 'project:project-1',
    role: 'user',
    type: 'text',
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
    content: { format: 2, parts: [{ type: 'text', text: 'Question' }] },
  },
  {
    id: 'assistant-1',
    threadId: 'thread-1',
    resourceId: 'project:project-1',
    role: 'assistant',
    type: 'text',
    createdAt: new Date('2026-08-10T10:01:00.000Z'),
    content: {
      format: 2,
      parts: [
        {
          type: 'tool-invocation',
          toolInvocation: {
            toolCallId: 'tool-1',
            toolName: 'search',
            args: { q: 'example' },
            result: { ok: true },
            state: 'result',
          },
        },
        { type: 'text', text: 'Answer' },
      ],
    },
  },
] as any;
const createToolStateMessage = ({
  id,
  toolCallId,
  state,
  result,
  toolName = 'search',
  args = { q: 'example' },
  createdAt = '2026-08-10T10:01:00.000Z',
}: {
  id: string;
  toolCallId: string;
  state: 'call' | 'result';
  result?: unknown;
  toolName?: string;
  args?: unknown;
  createdAt?: string;
}) => ({
  id,
  threadId: 'thread-1',
  resourceId: 'project:project-1',
  role: 'assistant',
  type: 'text',
  createdAt: new Date(createdAt),
  content: {
    format: 2,
    parts: [
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId,
          toolName,
          args,
          state,
          ...(state === 'result' ? { result } : {}),
        },
      },
    ],
  },
});
const messages = [
  {
    id: 'user-1',
    role: 'user',
    parts: [
      { type: 'text', text: 'Question' },
      { type: 'reasoning', text: 'hidden user reasoning' },
    ],
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'hidden chain of thought' },
      { type: 'text', text: 'Answer' },
      { type: 'tool-search', input: { q: 'example' }, output: { ok: true } },
    ],
  },
] as any;
const threads = [{ thread, messages, rawMessages }] as any;

describe('project chat export', () => {
  it('creates readable Markdown with message bodies', () => {
    const result = createProjectChatExport(
      'markdown',
      project,
      threads,
      '2026-08-11T00:00:00.000Z',
    );
    expect(result.content).toContain('# Example project chat history');
    expect(result.content).toContain('### user');
    expect(result.content).toContain('Question');
    expect(result.content).toContain('[tool-search]');
    expect(result.messageCount).toBe(2);
  });

  it('preserves raw Mastra messages and expands tool messages in JSON', () => {
    const result = createProjectChatExport('json', project, threads);
    const parsed = JSON.parse(result.content as string);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.threads[0].messages).toEqual(
      JSON.parse(JSON.stringify(rawMessages)),
    );
    expect(
      parsed.threads[0].modelMessages.map((message: any) => message.role),
    ).toEqual(['user', 'assistant', 'tool', 'assistant']);
    const toolMessage = parsed.threads[0].modelMessages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage.content[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: 'tool-1',
      toolName: 'search',
      output: { type: 'json', value: { ok: true } },
    });
  });

  it('creates Unsloth JSONL with tool calls and tool result bodies', () => {
    const result = createProjectChatExport('unsloth', project, threads);
    const parsed = JSON.parse((result.content as string).trim());
    expect(parsed).toEqual({
      messages: [
        { role: 'user', content: 'Question' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tool-1',
              type: 'function',
              function: {
                name: 'search',
                arguments: { q: 'example' },
              },
            },
          ],
        },
        {
          role: 'tool',
          content: '{"ok":true}',
          tool_call_id: 'tool-1',
          name: 'search',
        },
        { role: 'assistant', content: 'Answer' },
      ],
    });
    expect(result.messageCount).toBe(4);
  });

  it('keeps provider-executed tool bodies and removes incomplete tool calls', () => {
    const providerRawMessages = [
      rawMessages[0],
      {
        id: 'assistant-provider-tool',
        threadId: 'thread-1',
        resourceId: 'project:project-1',
        role: 'assistant',
        type: 'text',
        createdAt: new Date('2026-08-10T10:01:00.000Z'),
        content: {
          format: 2,
          parts: [
            {
              type: 'tool-invocation',
              providerExecuted: true,
              toolInvocation: {
                toolCallId: 'provider-tool-1',
                toolName: 'web_search',
                args: { q: 'example' },
                result: { answer: 42 },
                state: 'result',
              },
            },
            { type: 'text', text: 'Provider answer' },
          ],
        },
      },
      {
        id: 'assistant-incomplete-tool',
        threadId: 'thread-1',
        resourceId: 'project:project-1',
        role: 'assistant',
        type: 'text',
        createdAt: new Date('2026-08-10T10:02:00.000Z'),
        content: {
          format: 2,
          parts: [
            {
              type: 'tool-invocation',
              toolInvocation: {
                toolCallId: 'incomplete-tool-1',
                toolName: 'unfinished',
                args: {},
                state: 'call',
              },
            },
          ],
        },
      },
    ] as any;
    const providerThreads = [
      { thread, messages: [], rawMessages: providerRawMessages },
    ] as any;

    const result = createProjectChatExport('unsloth', project, providerThreads);
    const parsed = JSON.parse((result.content as string).trim());

    expect(parsed.messages).toEqual([
      { role: 'user', content: 'Question' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'provider-tool-1',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: { q: 'example' },
            },
          },
        ],
      },
      {
        role: 'tool',
        content: '{"answer":42}',
        tool_call_id: 'provider-tool-1',
        name: 'web_search',
      },
      { role: 'assistant', content: 'Provider answer' },
    ]);
    expect(JSON.stringify(parsed)).not.toContain('incomplete-tool-1');
    expect(result.messageCount).toBe(4);
  });

  it('pairs repeated tool states once and keeps the final result body', () => {
    const repeatedStateThreads = [
      {
        thread,
        messages: [],
        rawMessages: [
          rawMessages[0],
          createToolStateMessage({
            id: 'tool-call-state',
            toolCallId: 'repeated-tool-1',
            state: 'call',
          }),
          createToolStateMessage({
            id: 'tool-result-state-1',
            toolCallId: 'repeated-tool-1',
            state: 'result',
            result: { version: 1 },
          }),
          createToolStateMessage({
            id: 'tool-result-state-2',
            toolCallId: 'repeated-tool-1',
            state: 'result',
            result: { version: 2 },
          }),
          {
            ...rawMessages[1],
            id: 'assistant-final',
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Final answer' }],
            },
          },
        ],
      },
    ] as any;

    const result = createProjectChatExport(
      'unsloth',
      project,
      repeatedStateThreads,
    );
    const parsed = JSON.parse((result.content as string).trim());
    const toolCalls = parsed.messages.flatMap(
      (message: any) => message.tool_calls || [],
    );
    const toolResults = parsed.messages.filter(
      (message: any) => message.role === 'tool',
    );
    expect(parsed.messages.map((message: any) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].id).toBe('repeated-tool-1');
    expect(toolResults).toEqual([
      {
        role: 'tool',
        content: '{"version":2}',
        tool_call_id: 'repeated-tool-1',
        name: 'search',
      },
    ]);
  });

  it('does not pair tool states across user or assistant text boundaries', () => {
    const boundaryThreads = [
      {
        thread,
        messages: [],
        rawMessages: [
          rawMessages[0],
          createToolStateMessage({
            id: 'cross-user-call',
            toolCallId: 'cross-user-tool',
            state: 'call',
            createdAt: '2026-08-10T10:01:00.000Z',
          }),
          {
            ...rawMessages[0],
            id: 'user-2',
            createdAt: new Date('2026-08-10T10:02:00.000Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Follow-up question' }],
            },
          },
          createToolStateMessage({
            id: 'cross-user-result',
            toolCallId: 'cross-user-tool',
            state: 'result',
            result: { crossed: true },
            createdAt: '2026-08-10T10:03:00.000Z',
          }),
          createToolStateMessage({
            id: 'stable-call',
            toolCallId: 'stable-tool',
            state: 'call',
            createdAt: '2026-08-10T10:04:00.000Z',
          }),
          createToolStateMessage({
            id: 'stable-result',
            toolCallId: 'stable-tool',
            state: 'result',
            result: { version: 1 },
            createdAt: '2026-08-10T10:05:00.000Z',
          }),
          {
            ...rawMessages[1],
            id: 'assistant-boundary',
            createdAt: new Date('2026-08-10T10:06:00.000Z'),
            content: {
              format: 2,
              parts: [{ type: 'text', text: 'Final answer' }],
            },
          },
          createToolStateMessage({
            id: 'late-stable-result',
            toolCallId: 'stable-tool',
            state: 'result',
            result: { version: 2 },
            createdAt: '2026-08-10T10:07:00.000Z',
          }),
        ],
      },
    ] as any;

    const result = createProjectChatExport('unsloth', project, boundaryThreads);
    const parsed = JSON.parse((result.content as string).trim());
    const serialized = JSON.stringify(parsed);
    const toolResults = parsed.messages.filter(
      (message: any) => message.role === 'tool',
    );
    expect(parsed.messages.map((message: any) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(parsed.messages[0].content).toBe('Question\n\nFollow-up question');
    expect(serialized).not.toContain('cross-user-tool');
    expect(toolResults).toEqual([
      {
        role: 'tool',
        content: '{"version":1}',
        tool_call_id: 'stable-tool',
        name: 'search',
      },
    ]);
  });

  it('keeps parallel tool calls paired with both result bodies', () => {
    const parallelThreads = [
      {
        thread,
        messages: [],
        rawMessages: [
          rawMessages[0],
          {
            ...rawMessages[1],
            id: 'assistant-parallel-tools',
            content: {
              format: 2,
              parts: [
                {
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolCallId: 'parallel-1',
                    toolName: 'search',
                    args: { q: 'first' },
                    state: 'result',
                    result: { answer: 1 },
                  },
                },
                {
                  type: 'tool-invocation',
                  toolInvocation: {
                    toolCallId: 'parallel-2',
                    toolName: 'search',
                    args: { q: 'second' },
                    state: 'result',
                    result: { answer: 2 },
                  },
                },
                { type: 'text', text: 'Combined answer' },
              ],
            },
          },
        ],
      },
    ] as any;

    const result = createProjectChatExport('unsloth', project, parallelThreads);
    const parsed = JSON.parse((result.content as string).trim());

    expect(parsed.messages[1].tool_calls.map((call: any) => call.id)).toEqual([
      'parallel-1',
      'parallel-2',
    ]);
    expect(
      parsed.messages
        .filter((message: any) => message.role === 'tool')
        .map((message: any) => [message.tool_call_id, message.content]),
    ).toEqual([
      ['parallel-1', '{"answer":1}'],
      ['parallel-2', '{"answer":2}'],
    ]);
  });

  it('creates an XLSX workbook with thread and message sheets', () => {
    const result = createProjectChatExport('xlsx', project, threads);
    const workbook = XLSX.read(result.content, { type: 'buffer' });
    expect(workbook.SheetNames).toEqual(['Threads', 'Messages']);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Messages) as any[];
    expect(rows[0]).toMatchObject({
      thread_id: 'thread-1',
      role: 'user',
      content: expect.stringContaining('Question'),
    });
  });
});
