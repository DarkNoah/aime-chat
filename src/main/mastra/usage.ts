import { LanguageModelUsage, ModelMessage } from 'ai';
import tokenCounter, { countTokens } from '@/main/utils/tokenCounter';
import zodToJsonSchema from 'zod-to-json-schema';
import { consumedTokens, normalizeUsage } from 'tokenlens';

export type TokenCountTool = {
  id: string;
  description?: string;
  inputSchema?: unknown;
};

type MaybeUsage = Partial<LanguageModelUsage> & Record<string, unknown>;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
};

const getInputSchema = (inputSchema: unknown): unknown => {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return inputSchema;
  }

  if ('shape' in inputSchema) {
    return zodToJsonSchema(inputSchema as never);
  }

  if (
    'getSchema' in inputSchema &&
    typeof inputSchema.getSchema === 'function'
  ) {
    return inputSchema.getSchema();
  }

  return inputSchema;
};

export const countToolTokens = (
  tools?: Record<string, TokenCountTool>,
): number => {
  if (!tools) {
    return 0;
  }

  return Object.values(tools).reduce((total, tool) => {
    const schema = getInputSchema(tool.inputSchema);
    return (
      total +
      countTokens(
        `${tool.id}\n${tool.description ?? ''}\n${JSON.stringify(schema)}`,
      )
    );
  }, 0);
};

export const estimateContextTokens = async ({
  messages,
  tools,
}: {
  messages?: ModelMessage[];
  tools?: Record<string, TokenCountTool>;
}): Promise<number> => {
  return (await tokenCounter(messages ?? [])) + countToolTokens(tools);
};

export const resolveCompressionTokenCount = async ({
  messages,
  tools,
  usage,
}: {
  messages?: ModelMessage[];
  tools?: Record<string, TokenCountTool>;
  usage?: Partial<LanguageModelUsage>;
}): Promise<number> => {
  const estimatedContextTokens = await estimateContextTokens({
    messages,
    tools,
  });

  return Math.max(estimatedContextTokens, usage?.totalTokens ?? 0);
};

const hasProviderUsage = (usage?: MaybeUsage): boolean => {
  return consumedTokens(usage as never) > 0;
};

const toLanguageModelUsage = (usage?: MaybeUsage): LanguageModelUsage => {
  const normalized = normalizeUsage(usage as never);
  const inputTokens = normalized.input;
  const outputTokens = normalized.output;
  const totalTokens =
    toFiniteNumber(usage?.totalTokens) ??
    toFiniteNumber(normalized.total) ??
    inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens: toFiniteNumber(usage?.reasoningTokens) ?? 0,
    cachedInputTokens: toFiniteNumber(usage?.cachedInputTokens) ?? 0,
  };
};

export const resolveLanguageModelUsage = async ({
  usage,
  messages,
  tools,
  outputText,
}: {
  usage?: MaybeUsage | PromiseLike<MaybeUsage | undefined>;
  messages?: ModelMessage[];
  tools?: Record<string, TokenCountTool>;
  outputText?: string;
}): Promise<LanguageModelUsage> => {
  const providerUsage = await usage;

  if (hasProviderUsage(providerUsage)) {
    return toLanguageModelUsage(providerUsage);
  }

  const inputTokens = await estimateContextTokens({ messages, tools });
  const outputTokens = outputText ? countTokens(outputText) : 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    reasoningTokens: 0,
    cachedInputTokens: 0,
  };
};
