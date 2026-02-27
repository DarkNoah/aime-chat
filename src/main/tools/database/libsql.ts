import { ToolExecutionContext } from '@mastra/core/tools';
import BaseTool, { BaseToolParams } from '../base-tool';
import z from 'zod';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { createClient, Client as LibSQLClient, Row } from '@libsql/client';
import { getDataPath } from '@/main/utils';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';
import { app } from 'electron';
import { nanoid } from '@/utils/nanoid';


const getDbPath = (scope: 'global' | 'local', workspace: string) => {
  let db_path: string;
  if (workspace && scope === 'local') {
    const dir = path.join(workspace, '.aime-chat');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db_path = path.join(dir, 'database.db');
  } else if (scope === 'global') {
    db_path = getDataPath('global-database.db');
  } else {
    throw new Error('Invalid scope: when scope is "local", a valid workspace path is required.');
  }
  return db_path;
};

const createDbClient = (scope: 'global' | 'local', workspace: string): LibSQLClient => {
  const db_path = getDbPath(scope, workspace);
  return createClient({
    url: `file:${db_path}`,
  });
};

type ResultFormat = 'json' | 'markdown' | 'csv' | 'xlsx';

const escapeMarkdown = (value: unknown): string => {
  const str = value == null ? '' : String(value);
  return str.replace(/\|/g, '\\|');
};

const formatResultAsMarkdown = (columns: string[], rows: Row[]): string => {
  if (columns.length === 0) return 'No columns returned.';
  const header = '| ' + columns.map(escapeMarkdown).join(' | ') + ' |';
  const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
  const body = rows.map(
    (row) => '| ' + columns.map((col) => escapeMarkdown(row[col])).join(' | ') + ' |',
  );
  return [header, separator, ...body].join('\n');
};

const formatResultAsCsv = (columns: string[], rows: Row[]): string => {
  const escapeCsvField = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const header = columns.map(escapeCsvField).join(',');
  const body = rows.map(
    (row) => columns.map((col) => escapeCsvField(row[col])).join(','),
  );
  return [header, ...body].join('\n');
};

const formatResultAsXlsx = (columns: string[], rows: Row[]): string => {
  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of columns) {
      obj[col] = row[col];
    }
    return obj;
  });

  const ws = xlsx.utils.json_to_sheet(data, { header: columns });
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Result');

  const tmpDir = path.join(app.getPath('temp'), 'aime-chat', 'exports');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const filePath = path.join(tmpDir, `query-result-${nanoid()}.xlsx`);
  xlsx.writeFile(wb, filePath);
  return filePath;
};


export class LibSQLRun extends BaseTool {
  static readonly toolName = 'LibSQLRun';
  id: string = 'LibSQLRun';
  description = `Execute a SQL statement against a LibSQL/SQLite database.
- Supports both "global" (application-level) and "local" (workspace-level) database scopes
- Can execute any valid SQL statement: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, etc.
- Returns the query result rows for SELECT queries, or affected row count for write operations
- Use "global" scope for data shared across all workspaces, and "local" scope for workspace-specific data
- The database is automatically created if it does not exist
- Supports multiple output formats: "json" (default, structured data), "markdown" (table format), "csv" (comma-separated), "xlsx" (Excel file, returns file path)`;

  inputSchema = z.object({
    scope: z
      .enum(['global', 'local'])
      .describe('The scope of the database. Use "global" for application-level data or "local" for workspace-specific data.'),
    sql: z
      .string()
      .describe('The SQL statement to execute. Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE, etc.'),
    args: z
      .array(z.union([z.string(), z.number(), z.null()]))
      .optional()
      .describe('Optional positional parameters for the SQL statement (use ? placeholders in the SQL).'),
    format: z
      .enum(['json', 'markdown', 'csv', 'xlsx'])
      .optional()
      .default('json')
      .describe('The output format for query results. "json" returns structured data, "markdown" returns a markdown table, "csv" returns comma-separated values, "xlsx" generates an Excel file and returns the file path.'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { scope, sql, args, format = 'json' } = inputData;
    const { requestContext } = context;
    const workspace = requestContext.get('workspace' as never);
    const client = createDbClient(scope, workspace);

    try {
      const result = await client.execute({
        sql,
        args: args ?? [],
      });

      const { columns, rows, rowsAffected, lastInsertRowid } = result;

      switch (format) {
        case 'markdown':
          return rows.length > 0
            ? formatResultAsMarkdown(columns, rows)
            : `Query executed successfully. Rows affected: ${rowsAffected}`;

        case 'csv':
          return rows.length > 0
            ? formatResultAsCsv(columns, rows)
            : `Query executed successfully. Rows affected: ${rowsAffected}`;

        case 'xlsx': {
          if (rows.length === 0) {
            return `Query executed successfully. Rows affected: ${rowsAffected}. No data to export.`;
          }
          const filePath = formatResultAsXlsx(columns, rows);
          return `<file>${filePath}</file>`;
        }

        case 'json':
        default:
          return {
            columns,
            rows,
            rowsAffected,
            lastInsertRowid: lastInsertRowid?.toString(),
          };
      }
    } finally {
      client.close();
    }
  };
}

export class LibSQLListTable extends BaseTool {
  static readonly toolName = 'LibSQLListTable';
  id: string = 'LibSQLListTable';
  description = `List all tables in a LibSQL/SQLite database.
- Returns the names and SQL definitions of all user-created tables
- Useful for exploring database structure before running queries
- Supports both "global" and "local" database scopes`;

  inputSchema = z.object({
    scope: z
      .enum(['global', 'local'])
      .describe('The scope of the database. Use "global" for application-level data or "local" for workspace-specific data.'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { scope } = inputData;
    const { requestContext } = context;
    const workspace = requestContext.get('workspace' as never);
    const client = createDbClient(scope, workspace);

    try {
      const result = await client.execute({
        sql: `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      });

      return {
        tables: result.rows.map((row) => ({
          name: row.name,
          sql: row.sql,
        })),
      };
    } finally {
      client.close();
    }
  };
}

export class LibSQLDescribeTable extends BaseTool {
  static readonly toolName = 'LibSQLDescribeTable';
  id: string = 'LibSQLDescribeTable';
  description = `Describe the schema of one or more tables in a LibSQL/SQLite database.
- Accepts a single table name or an array of table names
- Returns column names, types, default values, whether nullable, and primary key info for each table
- Useful for understanding table structure before writing queries
- Also returns the row count and indexes of each table`;

  inputSchema = z.object({
    scope: z
      .enum(['global', 'local'])
      .describe('The scope of the database. Use "global" for application-level data or "local" for workspace-specific data.'),
    tables: z.array(z.string())
      .describe('The name of the table(s) to describe. Can be a single table name or an array of table names.'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  private async describeOne(client: LibSQLClient, tableName: string) {
    const columnsResult = await client.execute({
      sql: `PRAGMA table_info("${tableName}")`,
    });

    if (columnsResult.rows.length === 0) {
      throw new Error(`Table "${tableName}" does not exist.`);
    }

    const countResult = await client.execute({
      sql: `SELECT COUNT(*) as count FROM "${tableName}"`,
    });

    const indexResult = await client.execute({
      sql: `PRAGMA index_list("${tableName}")`,
    });

    return {
      table: tableName,
      columns: columnsResult.rows.map((row) => ({
        cid: row.cid,
        name: row.name,
        type: row.type,
        notnull: row.notnull,
        default_value: row.dflt_value,
        primary_key: row.pk,
      })),
      rowCount: countResult.rows[0]?.count ?? 0,
      indexes: indexResult.rows.map((row) => ({
        name: row.name,
        unique: row.unique,
      })),
    };
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { scope, tables } = inputData;
    const { requestContext } = context;
    const workspace = requestContext.get('workspace' as never);
    const client = createDbClient(scope, workspace);

    try {
      // const tables = Array.isArray(table) ? table : [table];
      const results = [];
      for (const t of tables) {
        results.push(await this.describeOne(client, t));
      }
      return results.length === 1 ? results[0] : results;
    } finally {
      client.close();
    }
  };
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
};

export class LibSQLDatabaseInfo extends BaseTool {
  static readonly toolName = 'LibSQLDatabaseInfo';
  id: string = 'LibSQLDatabaseInfo';
  description = `Display comprehensive information about a LibSQL/SQLite database.
- Shows database file path, file size, SQLite version, and page size
- Lists all tables with their row counts and column counts
- Lists all indexes and views in the database
- Provides a quick overview of the entire database structure
- Useful as the first step when exploring an unfamiliar database`;

  inputSchema = z.object({
    scope: z
      .enum(['global', 'local'])
      .describe('The scope of the database. Use "global" for application-level data or "local" for workspace-specific data.'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { scope } = inputData;
    const { requestContext } = context;
    const workspace = requestContext.get('workspace' as never);
    const dbPath = getDbPath(scope, workspace);
    const client = createDbClient(scope, workspace);

    try {
      // 数据库文件信息
      let fileSize = 0;
      let fileExists = false;
      if (fs.existsSync(dbPath)) {
        fileExists = true;
        const stats = fs.statSync(dbPath);
        fileSize = stats.size;
      }

      // SQLite 版本
      const versionResult = await client.execute({ sql: 'SELECT sqlite_version() as version' });
      const sqliteVersion = versionResult.rows[0]?.version as string;

      // 页大小
      const pageSizeResult = await client.execute({ sql: 'PRAGMA page_size' });
      const pageSize = pageSizeResult.rows[0]?.page_size as number;

      // 页数量
      const pageCountResult = await client.execute({ sql: 'PRAGMA page_count' });
      const pageCount = pageCountResult.rows[0]?.page_count as number;

      // Journal 模式
      const journalResult = await client.execute({ sql: 'PRAGMA journal_mode' });
      const journalMode = journalResult.rows[0]?.journal_mode as string;

      // 所有表信息
      const tablesResult = await client.execute({
        sql: `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      });

      const tables = [];
      for (const row of tablesResult.rows) {
        const tableName = row.name as string;
        const countResult = await client.execute({
          sql: `SELECT COUNT(*) as count FROM "${tableName}"`,
        });
        const colResult = await client.execute({
          sql: `PRAGMA table_info("${tableName}")`,
        });
        tables.push({
          name: tableName,
          rowCount: countResult.rows[0]?.count ?? 0,
          columnCount: colResult.rows.length,
        });
      }

      // 所有索引
      const indexesResult = await client.execute({
        sql: `SELECT name, tbl_name as tableName, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`,
      });

      // 所有视图
      const viewsResult = await client.execute({
        sql: `SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name`,
      });

      return {
        database: {
          path: dbPath,
          scope,
          fileExists,
          fileSize: formatBytes(fileSize),
          fileSizeBytes: fileSize,
          sqliteVersion,
          pageSize,
          pageCount,
          journalMode,
        },
        tables: tables,
        tableCount: tables.length,
        indexes: indexesResult.rows.map((row) => ({
          name: row.name,
          table: row.tableName,
          sql: row.sql,
        })),
        indexCount: indexesResult.rows.length,
        views: viewsResult.rows.map((row) => ({
          name: row.name,
          sql: row.sql,
        })),
        viewCount: viewsResult.rows.length,
      };
    } finally {
      client.close();
    }
  };
}

export class LibSQLToolkit extends BaseToolkit {
  static readonly toolName = 'LibSQLToolkit';
  id: string = 'LibSQLToolkit';
  description = 'LibSQL/SQLite database toolkit for executing SQL queries, listing tables, describing table schemas, and viewing database info. Supports both global and workspace-local databases.';

  constructor(params?: BaseToolkitParams) {
    super(
      [new LibSQLRun(), new LibSQLListTable(), new LibSQLDescribeTable(), new LibSQLDatabaseInfo()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
