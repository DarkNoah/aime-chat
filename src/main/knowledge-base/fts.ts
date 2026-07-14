type LibSQLClient = {
  execute: (statement: any) => Promise<any>;
  batch: (statements: any[]) => Promise<any>;
};

const FTS_BATCH_SIZE = 500;
const DEFAULT_RRF_K = 60;
const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : undefined;

export type FtsRow = {
  id: string;
  chunk: string;
};

export type RankedRow = {
  id: string;
  [key: string]: unknown;
};

export type RrfRow<T extends RankedRow> = T & {
  rrfScore: number;
};

const getWords = (text: string): string[] => {
  const normalized = text.normalize('NFKC').toLowerCase();
  if (wordSegmenter) {
    return Array.from(wordSegmenter.segment(normalized))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment.trim())
      .filter(Boolean);
  }

  return normalized.match(/[\p{L}\p{N}_]+/gu) ?? [];
};

export const segmentText = (text: string): string => getWords(text).join(' ');

export const buildMatchQuery = (query: string): string =>
  getWords(query)
    .map((word) => `"${word.replace(/"/g, '""')}"`)
    .join(' OR ');

export const getFtsTableName = (kbId: string): string => `kb_fts_${kbId}`;

export const getVectorTableName = (
  kbId: string,
  vectorLength: number,
): string => `kb_${kbId}_${vectorLength}`;

const quoteIdentifier = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`;

export const ftsTableExists = async (
  client: LibSQLClient,
  kbId: string,
): Promise<boolean> => {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    args: [getFtsTableName(kbId)],
  });
  return result.rows.length > 0;
};

export const createFtsTable = async (
  client: LibSQLClient,
  kbId: string,
): Promise<void> => {
  const tableName = quoteIdentifier(getFtsTableName(kbId));
  await client.execute(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName} USING fts5(
      chunk_id UNINDEXED,
      chunk_text
    )`,
  );
};

export const dropFtsTable = async (
  client: LibSQLClient,
  kbId: string,
): Promise<void> => {
  await client.execute(
    `DROP TABLE IF EXISTS ${quoteIdentifier(getFtsTableName(kbId))}`,
  );
};

export const insertFtsRows = async (
  client: LibSQLClient,
  kbId: string,
  rows: FtsRow[],
): Promise<void> => {
  if (rows.length === 0) return;

  const tableName = quoteIdentifier(getFtsTableName(kbId));
  for (let offset = 0; offset < rows.length; offset += FTS_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + FTS_BATCH_SIZE).map((row) => ({
      sql: `INSERT INTO ${tableName} (chunk_id, chunk_text) VALUES (?, ?)`,
      args: [row.id, segmentText(row.chunk)],
    }));
    await client.batch(batch);
  }
};

export const deleteFtsRowsByIds = async (
  client: LibSQLClient,
  kbId: string,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return;

  const tableName = quoteIdentifier(getFtsTableName(kbId));
  for (let offset = 0; offset < ids.length; offset += FTS_BATCH_SIZE) {
    const batchIds = ids.slice(offset, offset + FTS_BATCH_SIZE);
    await client.execute({
      sql: `DELETE FROM ${tableName} WHERE chunk_id IN (${batchIds.map(() => '?').join(', ')})`,
      args: batchIds,
    });
  }
};

export const deleteFtsRowsByItemId = async (
  client: LibSQLClient,
  kbId: string,
  vectorLength: number,
  itemId: string,
  textOnly = false,
): Promise<void> => {
  const ftsTable = quoteIdentifier(getFtsTableName(kbId));
  const vectorTable = quoteIdentifier(getVectorTableName(kbId, vectorLength));
  await client.execute({
    sql: `DELETE FROM ${ftsTable}
      WHERE chunk_id IN (
        SELECT id FROM ${vectorTable}
        WHERE item_id = ?${textOnly ? ` AND ("type" IS NULL OR "type" = 'text')` : ''}
      )`,
    args: [itemId],
  });
};

export const backfillFtsTable = async (
  client: LibSQLClient,
  kbId: string,
  vectorLength: number,
): Promise<void> => {
  await createFtsTable(client, kbId);
  const ftsTable = quoteIdentifier(getFtsTableName(kbId));
  const vectorTable = quoteIdentifier(getVectorTableName(kbId, vectorLength));
  const result = await client.execute(
    `SELECT id, chunk FROM ${vectorTable}
      WHERE chunk IS NOT NULL AND ("type" IS NULL OR "type" = 'text')`,
  );

  await client.execute(`DELETE FROM ${ftsTable}`);
  await insertFtsRows(
    client,
    kbId,
    result.rows.map((row) => ({
      id: String(row.id),
      chunk: String(row.chunk),
    })),
  );
};

export const rrfFuse = <T extends RankedRow>(
  lists: T[][],
  k = DEFAULT_RRF_K,
): RrfRow<T>[] => {
  const nonEmptyLists = lists.filter((list) => list.length > 0);
  if (nonEmptyLists.length === 0) return [];

  const scores = new Map<string, number>();
  const rows = new Map<string, T>();

  for (const list of nonEmptyLists) {
    list.forEach((row, index) => {
      const rank = index + 1;
      scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + rank));
      rows.set(row.id, { ...(rows.get(row.id) ?? {}), ...row } as T);
    });
  }

  const maximumScore = nonEmptyLists.length / (k + 1);
  return Array.from(rows.entries())
    .map(([id, row]) => ({
      ...row,
      id,
      rrfScore: (scores.get(id) ?? 0) / maximumScore,
    }))
    .sort((a, b) => b.rrfScore - a.rrfScore);
};
