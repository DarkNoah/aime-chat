import { ModelMessage } from 'ai';
import tokenCounter, { countTokens } from '@/main/utils/tokenCounter';
import {
  estimateContextTokens,
  resolveCompressionTokenCount,
  resolveLanguageModelUsage,
} from '../usage';

jest.mock('tokenlens', () => {
  const normalizeUsage = (usage?: Record<string, number>) => {
    const input = usage?.inputTokens ?? usage?.promptTokens ?? 0;
    const output = usage?.outputTokens ?? usage?.completionTokens ?? 0;
    return {
      input,
      output,
      total: usage?.totalTokens ?? input + output,
    };
  };

  return {
    consumedTokens: (usage?: Record<string, number>) => {
      const normalized = normalizeUsage(usage);
      return normalized.total ?? normalized.input + normalized.output;
    },
    normalizeUsage,
  };
});

describe('resolveLanguageModelUsage', () => {
  const messages: ModelMessage[] = [
    {
      role: 'system',
      content: 'You are a concise assistant.',
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Summarize the current workspace.' }],
    },
  ];

  it('estimates context usage when provider usage is empty', async () => {
    const outputText = 'Workspace summary.';

    const usage = await resolveLanguageModelUsage({
      usage: {},
      messages,
      outputText,
    });

    const expectedInputTokens = await tokenCounter(messages);
    const expectedOutputTokens = countTokens(outputText);

    expect(usage).toEqual({
      inputTokens: expectedInputTokens,
      outputTokens: expectedOutputTokens,
      totalTokens: expectedInputTokens + expectedOutputTokens,
      reasoningTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('keeps provider usage when it contains token counts', async () => {
    const usage = await resolveLanguageModelUsage({
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        reasoningTokens: 2,
        cachedInputTokens: 3,
      },
      messages,
      outputText: 'This text should not be counted when provider usage exists.',
    });

    expect(usage).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      reasoningTokens: 2,
      cachedInputTokens: 3,
    });
  });
});

describe('resolveCompressionTokenCount', () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Should the conversation be compacted?',
    },
  ];
  const tools = {
    Read: {
      id: 'Read',
      description: 'Read a file',
      inputSchema: {
        getSchema: () => ({
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
        }),
      },
    },
  };

  it('uses the shared context estimator for compression token counts', async () => {
    await expect(
      resolveCompressionTokenCount({ messages, tools }),
    ).resolves.toBe(await estimateContextTokens({ messages, tools }));
  });

  it('keeps the larger stored usage total for compression decisions', async () => {
    await expect(
      resolveCompressionTokenCount({
        messages,
        tools,
        usage: { totalTokens: 100_000 },
      }),
    ).resolves.toBe(100_000);
  });
});
