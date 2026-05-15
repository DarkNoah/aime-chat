import Database from 'better-sqlite3';

export type SqliteColumn = {
  name: string;
};

export const quoteIdentifier = (identifier: string) =>
  `"${identifier.replace(/"/g, '""')}"`;

export const getCreateTableSql = (db: Database.Database, tableName: string) => {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql?: string } | undefined;
  if (!row?.sql) {
    throw new Error(`Table not found: ${tableName}`);
  }
  return row.sql;
};

export const getTableColumns = (db: Database.Database, tableName: string) =>
  db
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .map((column: SqliteColumn) => column.name);

export const insertRows = (
  targetDb: Database.Database,
  tableName: string,
  columns: string[],
  rows: Record<string, unknown>[],
) => {
  if (rows.length === 0) return;

  const columnSql = columns.map(quoteIdentifier).join(', ');
  const valueSql = columns.map(() => '?').join(', ');
  const statement = targetDb.prepare(
    `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql}) VALUES (${valueSql})`,
  );

  const insertMany = targetDb.transaction(
    (records: Record<string, unknown>[]) => {
      for (const row of records) {
        statement.run(columns.map((column) => row[column]));
      }
    },
  );
  insertMany(rows);
};

export const tableExists = (db: Database.Database, tableName: string) => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
};

export const rewriteCreateTableName = (
  createTableSql: string,
  sourceTableName: string,
  targetTableName: string,
) =>
  createTableSql.replace(
    new RegExp(
      `(CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?)(?:\\[${sourceTableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]|"${sourceTableName.replace(/"/g, '""')}"|\`${sourceTableName.replace(/`/g, '``')}\`|${sourceTableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'i',
    ),
    `$1${quoteIdentifier(targetTableName)}`,
  );
