import Database from 'better-sqlite3';
import {
  getCreateTableSql,
  getTableColumns,
  insertRows,
  quoteIdentifier,
  tableExists,
} from './sqlite-copy';

export type KnowledgeBaseSQLiteImportMode = 'overwrite' | 'append';

export type KnowledgeBaseSQLiteInfo = {
  id: string;
  name: string;
  vectorLength: number;
  itemCount: number;
};

type ImportKnowledgeBaseSQLiteOptions = {
  appDbPath: string;
  importDbPath: string;
  mode: KnowledgeBaseSQLiteImportMode;
};

const getSingleKnowledgeBase = (db: Database.Database) => {
  if (
    !tableExists(db, 'knowledgebase') ||
    !tableExists(db, 'knowledgebase_item')
  ) {
    throw new Error('Invalid knowledge base SQLite file');
  }
  const rows = db.prepare('SELECT * FROM knowledgebase').all() as Record<
    string,
    unknown
  >[];
  if (rows.length !== 1) {
    throw new Error('Only single knowledge base SQLite files are supported');
  }
  const kb = rows[0];
  if (!kb.id || !kb.vectorLength) {
    throw new Error('Invalid knowledge base metadata');
  }
  return kb;
};

const getVectorTableName = (kbId: string, vectorLength: number) =>
  `kb_${kbId}_${vectorLength}`;

const getRows = (
  db: Database.Database,
  tableName: string,
  columns: string[],
  whereSql?: string,
  args: unknown[] = [],
) =>
  db
    .prepare(
      `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(tableName)}${whereSql ? ` ${whereSql}` : ''}`,
    )
    .all(...args) as Record<string, unknown>[];

export const inspectKnowledgeBaseSQLite = (
  importDbPath: string,
): KnowledgeBaseSQLiteInfo => {
  const db = new Database(importDbPath, { readonly: true });
  try {
    const kb = getSingleKnowledgeBase(db);
    const kbId = String(kb.id);
    const vectorLength = Number(kb.vectorLength);
    const vectorTableName = getVectorTableName(kbId, vectorLength);
    if (!tableExists(db, vectorTableName)) {
      throw new Error(`Table not found: ${vectorTableName}`);
    }
    const tableNames = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
    const expectedTableNames = [
      vectorTableName,
      'knowledgebase',
      'knowledgebase_item',
    ].sort();
    if (JSON.stringify(tableNames) !== JSON.stringify(expectedTableNames)) {
      throw new Error('Only single knowledge base SQLite export files are supported');
    }
    const itemCount = (
      db
        .prepare(
          'SELECT COUNT(*) as count FROM knowledgebase_item WHERE knowledgeBaseId = ?',
        )
        .get(kbId) as { count: number }
    ).count;
    return {
      id: kbId,
      name: String(kb.name ?? kbId),
      vectorLength,
      itemCount,
    };
  } finally {
    db.close();
  }
};

const copyImportedSchema = (
  importDb: Database.Database,
  appDb: Database.Database,
  tableName: string,
) => {
  if (!tableExists(appDb, tableName)) {
    appDb.exec(getCreateTableSql(importDb, tableName));
  }
};

export const importKnowledgeBaseSQLite = ({
  appDbPath,
  importDbPath,
  mode,
}: ImportKnowledgeBaseSQLiteOptions): KnowledgeBaseSQLiteInfo => {
  const imported = inspectKnowledgeBaseSQLite(importDbPath);
  const vectorTableName = getVectorTableName(
    imported.id,
    imported.vectorLength,
  );
  const importDb = new Database(importDbPath, { readonly: true });
  const appDb = new Database(appDbPath);

  try {
    const importedKb = getSingleKnowledgeBase(importDb);
    const existingKb = appDb
      .prepare('SELECT * FROM knowledgebase WHERE id = ?')
      .get(imported.id) as Record<string, unknown> | undefined;

    if (
      mode === 'append' &&
      existingKb &&
      Number(existingKb.vectorLength) !== imported.vectorLength
    ) {
      throw new Error('Cannot append: vectorLength is different');
    }

    const kbColumns = getTableColumns(importDb, 'knowledgebase');
    const itemColumns = getTableColumns(importDb, 'knowledgebase_item');
    const vectorColumns = getTableColumns(importDb, vectorTableName);

    const importedItems = getRows(
      importDb,
      'knowledgebase_item',
      itemColumns,
      'WHERE knowledgeBaseId = ?',
      [imported.id],
    );
    const importedVectors = getRows(importDb, vectorTableName, vectorColumns);

    appDb.exec('BEGIN');
    try {
      if (mode === 'overwrite') {
        if (existingKb) {
          const oldVectorTableName = getVectorTableName(
            imported.id,
            Number(existingKb.vectorLength),
          );
          appDb.exec(
            `DROP TABLE IF EXISTS ${quoteIdentifier(oldVectorTableName)}`,
          );
          appDb
            .prepare('DELETE FROM knowledgebase_item WHERE knowledgeBaseId = ?')
            .run(imported.id);
          appDb
            .prepare('DELETE FROM knowledgebase WHERE id = ?')
            .run(imported.id);
        }
        copyImportedSchema(importDb, appDb, 'knowledgebase');
        copyImportedSchema(importDb, appDb, 'knowledgebase_item');
        appDb.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(vectorTableName)}`);
        appDb.exec(getCreateTableSql(importDb, vectorTableName));

        insertRows(appDb, 'knowledgebase', kbColumns, [importedKb]);
        insertRows(appDb, 'knowledgebase_item', itemColumns, importedItems);
        insertRows(appDb, vectorTableName, vectorColumns, importedVectors);
      } else {
        copyImportedSchema(importDb, appDb, 'knowledgebase');
        copyImportedSchema(importDb, appDb, 'knowledgebase_item');
        copyImportedSchema(importDb, appDb, vectorTableName);

        if (!existingKb) {
          insertRows(appDb, 'knowledgebase', kbColumns, [importedKb]);
        }

        const existingItemIds = new Set(
          (
            appDb
              .prepare(
                'SELECT id FROM knowledgebase_item WHERE knowledgeBaseId = ?',
              )
              .all(imported.id) as { id: string }[]
          ).map((row) => row.id),
        );
        const missingItems = importedItems.filter(
          (row) => !existingItemIds.has(String(row.id)),
        );
        const missingItemIds = new Set(missingItems.map((row) => row.id));
        const missingVectors = importedVectors.filter((row) =>
          missingItemIds.has(row.item_id),
        );

        insertRows(appDb, 'knowledgebase_item', itemColumns, missingItems);
        insertRows(appDb, vectorTableName, vectorColumns, missingVectors);
      }
      appDb.exec('COMMIT');
    } catch (error) {
      appDb.exec('ROLLBACK');
      throw error;
    }
    return imported;
  } finally {
    appDb.close();
    importDb.close();
  }
};
