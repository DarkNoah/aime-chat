import type { Agent, AgentExecutionOptions } from '@mastra/core/agent';
import type { ProcessLLMRequestArgs } from '@mastra/core/processors';
import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { startNextStep } from '../next-step';
import { IMAGE_PLACEHOLDER } from '../../utils/message-image-filter';

const image = {
  type: 'file' as const,
  data: 'aW1hZ2U=',
  mediaType: 'image/png',
};
const prompt: LanguageModelV2Prompt = [
  { role: 'user', content: [image] },
  { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
  { role: 'user', content: Array.from({ length: 11 }, () => ({ ...image })) },
];
const expected = [
  { role: 'user', content: [{ type: 'text', text: IMAGE_PLACEHOLDER }] },
  prompt[1],
  {
    role: 'user',
    content: [
      { type: 'text', text: IMAGE_PLACEHOLDER },
      ...Array(10).fill(image),
    ],
  },
];

function setup() {
  const sentPrompts = [];
  const output = {
    consumeStream: jest.fn().mockResolvedValue(undefined),
    toolResults: Promise.resolve([
      { runId: 'stale-run', payload: { result: 'declined' } },
    ]),
  };
  const dispatch = async (options: AgentExecutionOptions) => {
    let outgoing = prompt;
    for (const processor of options.inputProcessors ?? []) {
      if ('processLLMRequest' in processor) {
        // eslint-disable-next-line no-await-in-loop -- Match Mastra's ordered processor pipeline.
        const result = await processor.processLLMRequest({
          prompt: outgoing,
        } as ProcessLLMRequestArgs);
        if (result && result.prompt) outgoing = result.prompt;
      }
    }
    sentPrompts.push(outgoing);
    return output;
  };
  const agent = {
    listSuspendedRuns: jest.fn().mockResolvedValue({ total: 0, runs: [] }),
    stream: jest.fn((_input, options) => dispatch(options)),
    approveToolCall: jest.fn((options) => dispatch(options)),
    declineToolCall: jest.fn((options) => dispatch(options)),
    resumeStream: jest.fn((_data, options) => dispatch(options)),
  };
  const options = {
    runId: 'current-run',
    requestContext: {
      get: (key: string) =>
        ({ threadId: 'thread', resourceId: 'resource' })[key],
    },
  } as AgentExecutionOptions;
  return { agent, options, output, sentPrompts };
}

describe('nextStep request dispatch', () => {
  it('filters normal sends and tool continuations when callers supply no processors', async () => {
    const { agent, options, output, sentPrompts } = setup();
    expect(await startNextStep(agent as unknown as Agent, [], options)).toBe(
      output,
    );
    expect(sentPrompts).toEqual([expected]);
    const continued: LanguageModelV2Prompt = [
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: '1', toolName: 'Read', input: {} },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '1',
            toolName: 'Read',
            output: {
              type: 'content',
              value: [
                { type: 'media', data: 'aW1hZ2U=', mediaType: 'image/png' },
              ],
            },
          },
        ],
      },
    ];
    await startNextStep(agent as unknown as Agent, continued, options);
    expect(agent.stream.mock.calls[1][0]).toBe(continued);
    expect(agent.stream.mock.calls[1][1].inputProcessors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'message-images' }),
      ]),
    );
    expect(options.inputProcessors).toBeUndefined();
    expect(prompt[0].content).toEqual([image]);
  });

  it.each([
    ['approveToolCall', { toolCallId: '1', approved: true }],
    ['declineToolCall', { toolCallId: '1', approved: false }],
    ['resumeStream', { toolCallId: '1', resumeData: { answer: 'yes' } }],
  ] as const)(
    'filters %s without caller-supplied processors',
    async (method, resume) => {
      const { agent, options, output, sentPrompts } = setup();
      expect(
        await startNextStep(agent as unknown as Agent, [], options, resume),
      ).toBe(output);
      expect(agent[method]).toHaveBeenCalledTimes(1);
      expect(agent.stream).not.toHaveBeenCalled();
      expect(sentPrompts).toEqual([expected]);
      const call = agent[method].mock.calls[0];
      expect(call[call.length - 1]).toMatchObject({
        runId: 'current-run',
        toolCallId: '1',
      });
      expect(agent.resumeStream.mock.calls.map(([data]) => data)).toEqual(
        method === 'resumeStream' ? [{ answer: 'yes' }] : [],
      );
    },
  );

  it('filters stale declines and the following new stream, preserving original input', async () => {
    const { agent, options, output, sentPrompts } = setup();
    agent.listSuspendedRuns.mockResolvedValue({
      total: 1,
      runs: [{ runId: 'stale-run', toolCalls: [{ toolCallId: 'old-call' }] }],
    });
    const part = Object.freeze({
      type: 'tool-Read',
      toolCallId: 'old-call',
      state: 'input-available',
      input: {},
    });
    const input = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        parts: Object.freeze([part]),
      },
    ];
    await startNextStep(agent as unknown as Agent, input as never, options);
    expect(sentPrompts).toEqual([expected, expected]);
    expect(output.consumeStream).toHaveBeenCalledTimes(1);
    expect(agent.declineToolCall.mock.calls[0][0]).toMatchObject({
      runId: 'stale-run',
      toolCallId: 'old-call',
    });
    expect(agent.stream.mock.calls[0][0][0].parts[0]).toMatchObject({
      state: 'output-available',
      output: 'declined',
    });
    expect(input[0].parts[0].state).toBe('input-available');
  });

  it('preserves other processors, replacing duplicate image filters and running last', async () => {
    const { agent, options, sentPrompts } = setup();
    const custom = {
      id: 'custom',
      processLLMRequest: jest.fn(({ prompt: input }) => ({ prompt: input })),
    };
    const staleFilter = { id: 'message-images', processLLMRequest: jest.fn() };
    const existing = [staleFilter, custom, staleFilter];
    options.inputProcessors = existing;
    await startNextStep(agent as unknown as Agent, [], options);
    expect(agent.stream.mock.calls[0][1].inputProcessors).toEqual([
      custom,
      expect.objectContaining({ id: 'message-images' }),
    ]);
    expect(options.inputProcessors).toBe(existing);
    expect(custom.processLLMRequest).toHaveBeenCalledTimes(1);
    expect(staleFilter.processLLMRequest).not.toHaveBeenCalled();
    expect(sentPrompts).toEqual([expected]);
  });
});
