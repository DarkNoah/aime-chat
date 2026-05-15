import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  getCreateTableSql,
  getTableColumns,
  insertRows,
  quoteIdentifier,
  rewriteCreateTableName,
} from './sqlite-copy';

type ExportKnowledgeBaseSQLiteOptions = {
  sourceDbPath: string;
  targetDbPath: string;
  kbId: string;
  vectorLength: number;
  exportKbId?: string;
};

const copyTableSchema = (
  sourceDb: Database.Database,
  targetDb: Database.Database,
  tableName: string,
  targetTableName: string = tableName,
) => {
  const createSql = getCreateTableSql(sourceDb, tableName);
  targetDb.exec(
    tableName === targetTableName
      ? createSql
      : rewriteCreateTableName(createSql, tableName, targetTableName),
  );
};

export function exportKnowledgeBaseSQLite({
  sourceDbPath,
  targetDbPath,
  kbId,
  vectorLength,
  exportKbId,
}: ExportKnowledgeBaseSQLiteOptions) {
  const resolvedSource = path.resolve(sourceDbPath);
  const resolvedTarget = path.resolve(targetDbPath);
  if (resolvedSource === resolvedTarget) {
    throw new Error('Export target cannot be the current application database');
  }

  const targetKbId = exportKbId?.trim() || kbId;
  const vectorTableName = `kb_${kbId}_${vectorLength}`;
  const targetVectorTableName = `kb_${targetKbId}_${vectorLength}`;
  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  if (fs.existsSync(resolvedTarget)) {
    fs.rmSync(resolvedTarget, { force: true });
  }

  const sourceDb = new Database(resolvedSource, { readonly: true });
  const targetDb = new Database(resolvedTarget);

  try {
    copyTableSchema(sourceDb, targetDb, 'knowledgebase');
    copyTableSchema(sourceDb, targetDb, 'knowledgebase_item');
    copyTableSchema(sourceDb, targetDb, vectorTableName, targetVectorTableName);

    const knowledgeBaseColumns = getTableColumns(sourceDb, 'knowledgebase');
    const itemColumns = getTableColumns(sourceDb, 'knowledgebase_item');
    const vectorColumns = getTableColumns(sourceDb, vectorTableName);

    const knowledgeBaseRows = sourceDb
      .prepare(
        `SELECT ${knowledgeBaseColumns.map(quoteIdentifier).join(', ')} FROM knowledgebase WHERE id = ?`,
      )
      .all(kbId) as Record<string, unknown>[];
    if (knowledgeBaseRows.length === 0) {
      throw new Error('Knowledge base not found');
    }
    knowledgeBaseRows[0].id = targetKbId;

    const itemRows = sourceDb
      .prepare(
        `SELECT ${itemColumns.map(quoteIdentifier).join(', ')} FROM knowledgebase_item WHERE knowledgeBaseId = ? AND state = ?`,
      )
      .all(kbId, 'completed') as Record<string, unknown>[];
    const completedItemIds = new Set(itemRows.map((row) => row.id));
    for (const row of itemRows) {
      row.knowledgeBaseId = targetKbId;
    }
    const vectorRows = sourceDb
      .prepare(
        `SELECT ${vectorColumns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(vectorTableName)}`,
      )
      .all()
      .filter((row: Record<string, unknown>) =>
        completedItemIds.has(row.item_id),
      ) as Record<string, unknown>[];

    targetDb.exec('BEGIN');
    try {
      insertRows(
        targetDb,
        'knowledgebase',
        knowledgeBaseColumns,
        knowledgeBaseRows,
      );
      insertRows(targetDb, 'knowledgebase_item', itemColumns, itemRows);
      insertRows(targetDb, targetVectorTableName, vectorColumns, vectorRows);
      targetDb.exec('COMMIT');
    } catch (error) {
      targetDb.exec('ROLLBACK');
      throw error;
    }
  } finally {
    targetDb.close();
    sourceDb.close();
  }
}
