import { ToolExecutionContext } from '@mastra/core/tools';
import BaseTool, { BaseToolParams } from '../base-tool';
import z from 'zod';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { createClient, Client as LibSQLClient } from '@libsql/client';

export class LibSQLQuery extends BaseTool {
  static readonly toolName = 'LibSQLQuery';
  id: string = 'LibSQLQuery';
  description = `
`;
  inputSchema = z.object({
    sql: z
      .string()
      .describe(`The skill name (no arguments). E.g., "pdf" or "xlsx"`),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {};
}

export class LibSQLCreateTable extends BaseTool {
  static readonly toolName = 'LibSQLCreateTable';
  id: string = 'LibSQLCreateTable';
  description = `
`;
  inputSchema = z.object({
    db_path: z
      .string()
      .describe(`The path to the database file. E.g., "data.db"`),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { db_path } = inputData;
    const client = createClient({
      url: `file:${db_path}`,
    });

    const result = await client.execute({
      sql: `CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)`,
    });

    return result.rows;
  };
}

export class LibSQLListTable extends BaseTool {
  static readonly toolName = 'LibSQLListTable';
  id: string = 'LibSQLListTable';
  description = `
`;
  inputSchema = z.object({});

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { db_path } = inputData;
    const client = createClient({
      url: `file:${db_path}`,
    });

    const result = await client.execute({
      sql: `CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)`,
    });

    return result.rows;
  };
}

export class LibSQLToolkit extends BaseToolkit {
  static readonly toolName = 'LibSQLToolkit';
  id: string = 'LibSQLToolkit';
  description = 'LibSQL Database client';

  constructor(params?: BaseToolkitParams) {
    super([], params);
  }

  getTools() {
    return this.tools;
  }
}
