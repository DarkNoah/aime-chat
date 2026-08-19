import type { KnowledgeBaseVectorStoreConfig } from '@/types/knowledge-base';

/* eslint-disable no-continue -- tokenizer branches advance independently */

export type KnowledgeBaseFilterValue = string | number | boolean | null;

export type CompiledKnowledgeBaseFilter = {
  sql: string;
  args: KnowledgeBaseFilterValue[];
};

type ExtendColumn = NonNullable<
  KnowledgeBaseVectorStoreConfig['extendColumns']
>[number];

type Token = {
  type:
    | 'bare'
    | 'quoted'
    | 'number'
    | 'operator'
    | 'leftParen'
    | 'rightParen'
    | 'comma';
  value: string;
  position: number;
};

const MAX_FILTER_LENGTH = 2_000;
const MAX_FILTER_CONDITIONS = 50;
const MAX_IN_VALUES = 100;

const quoteIdentifier = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`;

const isWhitespace = (value: string): boolean => /\s/u.test(value);
const isDelimiter = (value: string): boolean =>
  isWhitespace(value) || '(),=<>!'.includes(value);

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    if (isWhitespace(input[index])) {
      index += 1;
      continue;
    }

    const position = index;
    const character = input[index];
    if (character === '(' || character === ')' || character === ',') {
      const punctuationType: Record<string, Token['type']> = {
        '(': 'leftParen',
        ')': 'rightParen',
        ',': 'comma',
      };
      tokens.push({
        type: punctuationType[character],
        value: character,
        position,
      });
      index += 1;
      continue;
    }

    if ('=<>!'.includes(character)) {
      const twoCharacterOperator = input.slice(index, index + 2);
      const operator = ['!=', '<>', '<=', '>='].includes(twoCharacterOperator)
        ? twoCharacterOperator
        : character;
      if (!['=', '!=', '<>', '<', '<=', '>', '>='].includes(operator)) {
        throw new Error(
          `Invalid knowledge base where operator at position ${position + 1}`,
        );
      }
      tokens.push({ type: 'operator', value: operator, position });
      index += operator.length;
      continue;
    }

    if (character === "'" || character === '"' || character === '[') {
      const closingCharacter = character === '[' ? ']' : character;
      let value = '';
      index += 1;
      let closed = false;
      while (index < input.length) {
        if (input[index] === closingCharacter) {
          if (input[index + 1] === closingCharacter) {
            value += closingCharacter;
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += input[index];
        index += 1;
      }
      if (!closed) {
        throw new Error(
          `Unterminated quoted value in knowledge base where at position ${position + 1}`,
        );
      }
      tokens.push({ type: 'quoted', value, position });
      continue;
    }

    let value = '';
    while (index < input.length && !isDelimiter(input[index])) {
      value += input[index];
      index += 1;
    }
    if (!value) {
      throw new Error(
        `Invalid knowledge base where token at position ${position + 1}`,
      );
    }
    tokens.push({
      type: /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)
        ? 'number'
        : 'bare',
      value,
      position,
    });
  }

  return tokens;
};

class FilterParser {
  private index = 0;

  private conditionCount = 0;

  private readonly columnsByName: Map<string, ExtendColumn>;

  constructor(
    private readonly tokens: Token[],
    extendColumns: ExtendColumn[],
  ) {
    this.columnsByName = new Map(
      extendColumns.map((column) => [column.name.toLowerCase(), column]),
    );
  }

  parse(): CompiledKnowledgeBaseFilter {
    const result = this.parseOrExpression();
    const remaining = this.peek();
    if (remaining) {
      throw this.error(`Unexpected token "${remaining.value}"`, remaining);
    }
    return result;
  }

  private parseOrExpression(): CompiledKnowledgeBaseFilter {
    let result = this.parseAndExpression();
    while (this.matchKeyword('OR')) {
      const right = this.parseAndExpression();
      result = this.combine(result, 'OR', right);
    }
    return result;
  }

  private parseAndExpression(): CompiledKnowledgeBaseFilter {
    let result = this.parsePrimary();
    while (this.matchKeyword('AND')) {
      const right = this.parsePrimary();
      result = this.combine(result, 'AND', right);
    }
    return result;
  }

  private parsePrimary(): CompiledKnowledgeBaseFilter {
    if (this.matchType('leftParen')) {
      const result = this.parseOrExpression();
      this.consumeType('rightParen', 'Expected ")"');
      return { sql: `(${result.sql})`, args: result.args };
    }
    return this.parseCondition();
  }

  private parseCondition(): CompiledKnowledgeBaseFilter {
    this.conditionCount += 1;
    if (this.conditionCount > MAX_FILTER_CONDITIONS) {
      throw new Error(
        `Knowledge base where supports at most ${MAX_FILTER_CONDITIONS} conditions`,
      );
    }

    const columnToken = this.consumeColumn();
    const configuredColumn = this.columnsByName.get(
      columnToken.value.toLowerCase(),
    );
    if (!configuredColumn) {
      const availableColumns = [...this.columnsByName.values()]
        .map((column) => column.name)
        .join(', ');
      throw new Error(
        `Knowledge base where can only use configured extended columns. Unknown column "${columnToken.value}". Available columns: ${availableColumns || '(none)'}`,
      );
    }
    const columnSql = quoteIdentifier(configuredColumn.name);

    if (this.matchKeyword('IS')) {
      const not = this.matchKeyword('NOT');
      this.consumeKeyword('NULL', 'Expected NULL after IS or IS NOT');
      return { sql: `${columnSql} IS${not ? ' NOT' : ''} NULL`, args: [] };
    }

    const not = this.matchKeyword('NOT');
    if (this.matchKeyword('IN')) {
      return this.parseIn(columnSql, not);
    }
    if (this.matchKeyword('LIKE')) {
      const value = this.consumeValue();
      if (value === null) {
        throw this.error('LIKE does not accept NULL', this.previous());
      }
      return {
        sql: `${columnSql}${not ? ' NOT' : ''} LIKE ?`,
        args: [value],
      };
    }
    if (not) {
      throw this.error('Expected IN or LIKE after NOT', this.previous());
    }

    const operator = this.consumeType(
      'operator',
      'Expected a comparison operator, IN, LIKE, or IS NULL',
    ).value;
    const value = this.consumeValue();
    if (value === null) {
      if (operator === '=') return { sql: `${columnSql} IS NULL`, args: [] };
      if (operator === '!=' || operator === '<>') {
        return { sql: `${columnSql} IS NOT NULL`, args: [] };
      }
      throw this.error(
        'NULL only supports =, !=, or <> comparisons',
        this.previous(),
      );
    }
    return { sql: `${columnSql} ${operator} ?`, args: [value] };
  }

  private parseIn(
    columnSql: string,
    not: boolean,
  ): CompiledKnowledgeBaseFilter {
    this.consumeType('leftParen', 'Expected "(" after IN');
    const values: KnowledgeBaseFilterValue[] = [];
    do {
      if (values.length >= MAX_IN_VALUES) {
        throw new Error(
          `Knowledge base where IN supports at most ${MAX_IN_VALUES} values`,
        );
      }
      values.push(this.consumeValue());
    } while (this.matchType('comma'));
    this.consumeType('rightParen', 'Expected ")" after IN values');
    if (values.some((value) => value === null)) {
      throw this.error('IN does not accept NULL; use IS NULL', this.previous());
    }
    return {
      sql: `${columnSql}${not ? ' NOT' : ''} IN (${values
        .map(() => '?')
        .join(', ')})`,
      args: values,
    };
  }

  private consumeColumn(): Token {
    const token = this.peek();
    if (token?.type !== 'bare' && token?.type !== 'quoted') {
      throw this.error('Expected an extended column name', token);
    }
    this.index += 1;
    return token;
  }

  private consumeValue(): KnowledgeBaseFilterValue {
    const token = this.peek();
    if (!token) throw this.error('Expected a comparison value', token);
    this.index += 1;
    if (token.type === 'quoted') return token.value;
    if (token.type === 'number') {
      const value = Number(token.value);
      if (!Number.isFinite(value)) {
        throw this.error('Comparison number must be finite', token);
      }
      return value;
    }
    if (token.type === 'bare') {
      const keyword = token.value.toUpperCase();
      if (keyword === 'TRUE') return true;
      if (keyword === 'FALSE') return false;
      if (keyword === 'NULL') return null;
    }
    throw this.error(
      'String values must be quoted; booleans may use TRUE or FALSE',
      token,
    );
  }

  // eslint-disable-next-line class-methods-use-this
  private combine(
    left: CompiledKnowledgeBaseFilter,
    operator: 'AND' | 'OR',
    right: CompiledKnowledgeBaseFilter,
  ): CompiledKnowledgeBaseFilter {
    return {
      sql: `${left.sql} ${operator} ${right.sql}`,
      args: [...left.args, ...right.args],
    };
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private previous(): Token | undefined {
    return this.tokens[this.index - 1];
  }

  private matchType(type: Token['type']): boolean {
    if (this.peek()?.type !== type) return false;
    this.index += 1;
    return true;
  }

  private matchKeyword(keyword: string): boolean {
    const token = this.peek();
    if (token?.type !== 'bare' || token.value.toUpperCase() !== keyword) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private consumeKeyword(keyword: string, message: string): Token {
    if (!this.matchKeyword(keyword)) throw this.error(message, this.peek());
    return this.previous()!;
  }

  private consumeType(type: Token['type'], message: string): Token {
    const token = this.peek();
    if (token?.type !== type) throw this.error(message, token);
    this.index += 1;
    return token;
  }

  // eslint-disable-next-line class-methods-use-this
  private error(message: string, token: Token | undefined): Error {
    return new Error(
      `${message} in knowledge base where at position ${(token?.position ?? 0) + 1}`,
    );
  }
}

/**
 * Compiles a deliberately small SQL-like expression into parameterized SQL.
 * Only configured extended columns can be referenced.
 */
export const compileKnowledgeBaseFilter = (
  where: string | null | undefined,
  extendColumns: ExtendColumn[] = [],
): CompiledKnowledgeBaseFilter | undefined => {
  if (where === null || typeof where === 'undefined') return undefined;
  const normalized = where.trim();
  if (!normalized) return undefined;
  if (normalized.length > MAX_FILTER_LENGTH) {
    throw new Error(
      `Knowledge base where must not exceed ${MAX_FILTER_LENGTH} characters`,
    );
  }
  if (extendColumns.length === 0) {
    throw new Error(
      'Knowledge base where requires at least one configured extended column',
    );
  }
  return new FilterParser(tokenize(normalized), extendColumns).parse();
};
