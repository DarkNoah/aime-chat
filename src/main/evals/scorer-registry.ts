/* eslint-disable import/no-cycle, no-continue, no-plusplus, no-use-before-define, no-extra-boolean-cast, no-nested-ternary, no-useless-constructor, no-empty-function, no-await-in-loop, no-console, class-methods-use-this */
import { Mastra } from '@mastra/core';
import { createScorer, MastraScorer } from '@mastra/core/evals';
import { z } from 'zod/v4';
import { checks } from '@mastra/evals/checks';
import {
  createAnswerRelevancyScorer,
  createBiasScorer,
  createCompletenessScorer,
  createFaithfulnessScorer,
  createHallucinationScorer,
  createPromptAlignmentScorerLLM,
  createToxicityScorer,
} from '@mastra/evals/scorers/prebuilt';
import {
  getAssistantMessageFromRunOutput,
  getUserMessageFromRunInput,
} from '@mastra/evals/scorers/utils';
import { Repository } from 'typeorm';
import { EvalScorer } from '@/entities/eval-scorers';
import {
  EvalCheckConfig,
  EvalLlmJudgeConfig,
  EvalOutputField,
  EvalScorerInfo,
  EvalScorerInput,
} from '@/types/evals';
import { providersManager } from '@/main/providers';

type AnyScorer = MastraScorer<any, any, any, any>;

const EMPTY_LLM_CONFIG: EvalLlmJudgeConfig = {
  judgeModelId: '',
  instructions: '',
  analyzePrompt: '',
  outputFields: [],
  scoreExpression: '',
};

const BUILT_IN_SCORERS: Array<
  EvalScorerInfo & {
    requiresModel: boolean;
    factory: (model?: any) => AnyScorer;
  }
> = [
  {
    id: 'completeness-scorer',
    name: 'Completeness',
    description:
      'Checks whether the response covers the key elements from the input.',
    kind: 'check',
    config: { checkType: 'completeness' },
    source: 'built_in',
    category: 'quality',
    scoreDirection: 'higher',
    requiresModel: false,
    factory: () => createCompletenessScorer(),
  },
  {
    id: 'answer-relevancy-scorer',
    name: 'Answer relevancy',
    description:
      'Evaluates how directly the response addresses the user input.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'quality',
    scoreDirection: 'higher',
    requiresModel: true,
    factory: (model) => createAnswerRelevancyScorer({ model }),
  },
  {
    id: 'faithfulness-scorer',
    name: 'Faithfulness',
    description:
      'Evaluates whether the response is supported by the provided context.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'quality',
    scoreDirection: 'higher',
    requiresModel: true,
    factory: (model) => createFaithfulnessScorer({ model }),
  },
  {
    id: 'hallucination-scorer',
    name: 'Hallucination',
    description:
      'Detects unsupported or contradictory claims. Lower is better.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'quality',
    scoreDirection: 'lower',
    requiresModel: true,
    factory: (model) => createHallucinationScorer({ model }),
  },
  {
    id: 'toxicity-scorer',
    name: 'Toxicity',
    description: 'Detects harmful or inappropriate content. Lower is better.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'safety',
    scoreDirection: 'lower',
    requiresModel: true,
    factory: (model) => createToxicityScorer({ model }),
  },
  {
    id: 'bias-scorer',
    name: 'Bias',
    description:
      'Detects biased language and unsupported opinions. Lower is better.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'safety',
    scoreDirection: 'lower',
    requiresModel: true,
    factory: (model) => createBiasScorer({ model }),
  },
  {
    id: 'prompt-alignment-scorer',
    name: 'Prompt alignment',
    description:
      'Measures intent, requirement, format, and completeness alignment.',
    kind: 'llm_judge',
    config: EMPTY_LLM_CONFIG,
    source: 'built_in',
    category: 'quality',
    scoreDirection: 'higher',
    requiresModel: true,
    factory: (model) => createPromptAlignmentScorerLLM({ model }),
  },
];

const BUILT_IN_BY_ID = new Map(
  BUILT_IN_SCORERS.map((definition) => [definition.id, definition]),
);

const FIELD_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' };

const tokenizeExpression = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }

    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ type: 'identifier', value: identifier[0] });
      index += identifier[0].length;
      continue;
    }

    const operator = rest.match(/^(?:&&|\|\||===|!==|>=|<=|==|!=|[+\-*/><!])/);
    if (operator) {
      tokens.push({ type: 'operator', value: operator[0] });
      index += operator[0].length;
      continue;
    }

    if (rest[0] === '(' || rest[0] === ')') {
      tokens.push({ type: 'paren', value: rest[0] });
      index += 1;
      continue;
    }

    throw new Error(
      `Unsupported token in score expression near "${rest.slice(0, 12)}"`,
    );
  }

  return tokens;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Score expression produced a non-numeric value: ${String(value)}`,
    );
  }
  return parsed;
};

const evaluateScoreExpression = (
  expression: string,
  values: Record<string, unknown>,
): number => {
  const tokens = tokenizeExpression(expression);
  let cursor = 0;

  const peek = () => tokens[cursor];
  const consume = () => tokens[cursor++];

  const parsePrimary = (): unknown => {
    const token = consume();
    if (!token) throw new Error('Unexpected end of score expression');
    if (token.type === 'number') return token.value;
    if (token.type === 'identifier') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (!(token.value in values)) {
        throw new Error(`Unknown field "${token.value}" in score expression`);
      }
      return values[token.value];
    }
    if (token.type === 'paren' && token.value === '(') {
      const result = parseOr();
      const closing = consume();
      if (closing?.type !== 'paren' || closing.value !== ')') {
        throw new Error('Missing closing parenthesis in score expression');
      }
      return result;
    }
    throw new Error('Invalid score expression');
  };

  const parseUnary = (): unknown => {
    const token = peek();
    if (
      token?.type === 'operator' &&
      (token.value === '!' || token.value === '-')
    ) {
      consume();
      const value = parseUnary();
      return token.value === '!' ? !Boolean(value) : -toNumber(value);
    }
    return parsePrimary();
  };

  const parseMultiplication = (): unknown => {
    let left = parseUnary();
    let next = peek();
    while (next?.type === 'operator' && ['*', '/'].includes(next.value)) {
      const operator = consume() as Extract<Token, { type: 'operator' }>;
      const right = parseUnary();
      left =
        operator.value === '*'
          ? toNumber(left) * toNumber(right)
          : toNumber(left) / toNumber(right);
      next = peek();
    }
    return left;
  };

  const parseAddition = (): unknown => {
    let left = parseMultiplication();
    let next = peek();
    while (next?.type === 'operator' && ['+', '-'].includes(next.value)) {
      const operator = consume() as Extract<Token, { type: 'operator' }>;
      const right = parseMultiplication();
      left =
        operator.value === '+'
          ? toNumber(left) + toNumber(right)
          : toNumber(left) - toNumber(right);
      next = peek();
    }
    return left;
  };

  const parseComparison = (): unknown => {
    let left = parseAddition();
    const token = peek();
    if (
      token?.type === 'operator' &&
      ['>', '>=', '<', '<=', '==', '===', '!=', '!=='].includes(token.value)
    ) {
      const operator = consume() as Extract<Token, { type: 'operator' }>;
      const right = parseAddition();
      switch (operator.value) {
        case '>':
          left = toNumber(left) > toNumber(right);
          break;
        case '>=':
          left = toNumber(left) >= toNumber(right);
          break;
        case '<':
          left = toNumber(left) < toNumber(right);
          break;
        case '<=':
          left = toNumber(left) <= toNumber(right);
          break;
        case '!=':
        case '!==':
          left = left !== right;
          break;
        default:
          left = left === right;
      }
    }
    return left;
  };

  const parseAnd = (): unknown => {
    let left = parseComparison();
    while (peek()?.type === 'operator' && peek().value === '&&') {
      consume();
      left = Boolean(left) && Boolean(parseComparison());
    }
    return left;
  };

  const parseOr = (): unknown => {
    let left = parseAnd();
    while (peek()?.type === 'operator' && peek().value === '||') {
      consume();
      left = Boolean(left) || Boolean(parseAnd());
    }
    return left;
  };

  const value = parseOr();
  if (cursor !== tokens.length) throw new Error('Invalid score expression');
  return Math.max(0, Math.min(1, toNumber(value)));
};

const fieldSchema = (field: EvalOutputField) => {
  let schema: z.ZodTypeAny;
  if (field.type === 'boolean') schema = z.boolean();
  else if (field.type === 'number') schema = z.number();
  else schema = z.string();
  return field.description ? schema.describe(field.description) : schema;
};

const renderTemplate = (template: string, variables: Record<string, unknown>) =>
  template.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_match, key) => {
    const value = variables[key];
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  });

const validateScorerInput = (input: EvalScorerInput) => {
  if (!input.name.trim()) throw new Error('Scorer name is required');
  if (input.kind === 'check') {
    if (!(input.config as EvalCheckConfig).checkType) {
      throw new Error('Check type is required');
    }
    return;
  }

  const config = input.config as EvalLlmJudgeConfig;
  if (!config.judgeModelId) throw new Error('Judge model is required');
  if (!config.instructions.trim())
    throw new Error('Judge instructions are required');
  if (!config.analyzePrompt.trim())
    throw new Error('Analyze prompt is required');
  if (!config.outputFields.length)
    throw new Error('At least one output field is required');
  const keys = new Set<string>();
  for (const field of config.outputFields) {
    if (!FIELD_KEY_PATTERN.test(field.key)) {
      throw new Error(`Invalid output field key: ${field.key}`);
    }
    if (keys.has(field.key))
      throw new Error(`Duplicate output field key: ${field.key}`);
    keys.add(field.key);
  }
  evaluateScoreExpression(
    config.scoreExpression,
    Object.fromEntries(
      config.outputFields.map((field) => [
        field.key,
        field.type === 'boolean' ? true : field.type === 'number' ? 1 : '1',
      ]),
    ),
  );
};

export class ScorerRegistry {
  private customScorers = new Map<string, AnyScorer>();

  constructor(
    private readonly mastra: Mastra,
    private readonly repository: Repository<EvalScorer>,
  ) {}

  async init() {
    for (const definition of BUILT_IN_SCORERS) {
      if (!definition.requiresModel) {
        const scorer = definition.factory();
        this.mastra.addScorer(scorer, scorer.id);
      }
    }

    const definitions = await this.repository.find();
    for (const definition of definitions) {
      try {
        await this.registerCustom(definition);
      } catch (error) {
        console.error(`Failed to register scorer ${definition.id}`, error);
      }
    }
  }

  async list(): Promise<EvalScorerInfo[]> {
    const custom = await this.repository.find({ order: { updatedAt: 'DESC' } });
    return [
      ...BUILT_IN_SCORERS.map(
        ({ factory: _factory, requiresModel: _requiresModel, ...definition }) =>
          definition,
      ),
      ...custom.map((definition) => ({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        kind: definition.kind,
        config: definition.config,
        source: 'custom' as const,
        category: 'custom' as const,
        scoreDirection: 'higher' as const,
        createdAt: definition.createdAt?.toISOString(),
        updatedAt: definition.updatedAt?.toISOString(),
      })),
    ];
  }

  async save(input: EvalScorerInput): Promise<EvalScorerInfo> {
    validateScorerInput(input);
    const existing = input.id
      ? await this.repository.findOne({ where: { id: input.id } })
      : null;
    const definition = existing || new EvalScorer(input);
    definition.name = input.name.trim();
    definition.description = input.description?.trim();
    definition.kind = input.kind;
    definition.config = input.config;
    const saved = await this.repository.save(definition);
    await this.registerCustom(saved);
    return {
      id: saved.id,
      name: saved.name,
      description: saved.description,
      kind: saved.kind,
      config: saved.config,
      source: 'custom',
      category: 'custom',
      scoreDirection: 'higher',
      createdAt: saved.createdAt?.toISOString(),
      updatedAt: saved.updatedAt?.toISOString(),
    };
  }

  async delete(id: string) {
    await this.repository.delete(id);
    this.customScorers.delete(id);
    this.mastra.removeScorer(id);
  }

  async createTemporary(input: EvalScorerInput): Promise<AnyScorer> {
    validateScorerInput(input);
    const definition = new EvalScorer({
      ...input,
      id: input.id || `eval-preview-${Date.now()}`,
    });
    return definition.kind === 'check'
      ? this.createCheckScorer(definition)
      : this.createLlmScorer(definition);
  }

  async get(id: string, fallbackJudgeModelId?: string): Promise<AnyScorer> {
    const custom = this.customScorers.get(id);
    if (custom) return custom;

    const builtIn = BUILT_IN_BY_ID.get(id);
    if (!builtIn) throw new Error(`Scorer not found: ${id}`);
    if (!builtIn.requiresModel) {
      const scorer = builtIn.factory();
      this.mastra.addScorer(scorer, scorer.id);
      return scorer;
    }
    if (!fallbackJudgeModelId) {
      throw new Error(`A judge model is required for scorer ${id}`);
    }
    const model = await providersManager.getLanguageModel(fallbackJudgeModelId);
    if (!model)
      throw new Error(`Judge model not found: ${fallbackJudgeModelId}`);
    const scorer = builtIn.factory(model as any);
    this.mastra.addScorer(scorer, scorer.id);
    return scorer;
  }

  private async registerCustom(definition: EvalScorer) {
    const scorer =
      definition.kind === 'check'
        ? this.createCheckScorer(definition)
        : await this.createLlmScorer(definition);
    this.customScorers.set(definition.id, scorer);
    this.mastra.addScorer(scorer, scorer.id);
  }

  private createCheckScorer(definition: EvalScorer): AnyScorer {
    const config = definition.config as EvalCheckConfig;
    const params = config.params || {};
    let base: AnyScorer;

    switch (config.checkType) {
      case 'completeness':
        base = createCompletenessScorer();
        break;
      case 'includes':
        base = checks.includes(String(params.value || ''), {
          ignoreCase: params.ignoreCase !== false,
        });
        break;
      case 'excludes':
        base = checks.excludes(String(params.value || ''), {
          ignoreCase: params.ignoreCase !== false,
        });
        break;
      case 'equals':
        base = checks.equals(String(params.value || ''), {
          ignoreCase: params.ignoreCase !== false,
        });
        break;
      case 'matches':
        base = checks.matches(
          new RegExp(String(params.pattern || ''), String(params.flags || 'i')),
          { exact: params.exact === true },
        );
        break;
      case 'similarity':
        base = checks.similarity(String(params.value || ''), {
          threshold:
            typeof params.threshold === 'number' ? params.threshold : undefined,
          ignoreCase: params.ignoreCase !== false,
        });
        break;
      case 'calledTool':
        base = checks.calledTool(String(params.toolName || ''), {
          times: typeof params.times === 'number' ? params.times : undefined,
        });
        break;
      case 'didNotCall':
        base = checks.didNotCall(String(params.toolName || ''));
        break;
      case 'toolOrder':
        base = checks.toolOrder(
          Array.isArray(params.tools) ? params.tools.map(String) : [],
        );
        break;
      case 'maxToolCalls':
        base = checks.maxToolCalls(Number(params.max || 0));
        break;
      case 'usedNoTools':
        base = checks.usedNoTools();
        break;
      case 'noToolErrors':
        base = checks.noToolErrors();
        break;
      default:
        throw new Error(`Unsupported check type: ${config.checkType}`);
    }

    return createScorer({
      id: definition.id,
      name: definition.name,
      description: definition.description || `Runs ${config.checkType}`,
    })
      .generateScore(async ({ run }) => {
        const result = await base.run(run as any);
        return typeof result.score === 'number' ? result.score : 0;
      })
      .generateReason(
        ({ score }) =>
          `${config.checkType} ${score === 1 ? 'passed' : 'did not pass'}`,
      );
  }

  private async createLlmScorer(definition: EvalScorer): Promise<AnyScorer> {
    const config = definition.config as EvalLlmJudgeConfig;
    const model = await providersManager.getLanguageModel(config.judgeModelId);
    if (!model)
      throw new Error(`Judge model not found: ${config.judgeModelId}`);
    const shape = Object.fromEntries(
      config.outputFields.map((field) => [field.key, fieldSchema(field)]),
    );

    let scorer: AnyScorer = createScorer({
      id: definition.id,
      name: definition.name,
      description: definition.description || definition.name,
      judge: {
        model: model as any,
        instructions: config.instructions,
      },
    })
      .analyze({
        description: `Analyze ${definition.name}`,
        outputSchema: z.object(shape),
        createPrompt: ({ run }) =>
          renderTemplate(config.analyzePrompt, {
            input: getUserMessageFromRunInput(run.input) || run.input,
            output: getAssistantMessageFromRunOutput(run.output) || run.output,
            groundTruth: run.groundTruth,
          }),
      })
      .generateScore(({ results }) =>
        evaluateScoreExpression(
          config.scoreExpression,
          results.analyzeStepResult as Record<string, unknown>,
        ),
      ) as AnyScorer;

    if (config.reasonPrompt?.trim()) {
      scorer = scorer.generateReason({
        description: `Explain ${definition.name}`,
        createPrompt: ({ results, score }) =>
          renderTemplate(config.reasonPrompt || '', {
            score,
            analysis: results.analyzeStepResult,
          }),
      }) as AnyScorer;
    } else {
      scorer = scorer.generateReason(
        ({ results, score }) =>
          `Score ${toNumber(score).toFixed(2)}. ${JSON.stringify(
            results.analyzeStepResult,
          )}`,
      ) as AnyScorer;
    }

    return scorer;
  }
}
