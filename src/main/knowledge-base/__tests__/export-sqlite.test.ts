import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { exportKnowledgeBaseSQLite } from '../export-sqlite';

describe('exportKnowledgeBaseSQLite', () => {
  let tempDir: string;
  let sourcePath: string;
  let targetPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-kb-export-'));
    sourcePath = path.join(tempDir, 'source.sqlite');
    targetPath = path.join(tempDir, 'target.sqlite');

    const db = new Database(sourcePath);
    db.exec(`
      CREATE TABLE knowledgebase (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        vectorLength INTEGER
      );
      CREATE TABLE knowledgebase_item (
        id TEXT PRIMARY KEY,
        knowledgeBaseId TEXT NOT NULL,
        name TEXT NOT NULL,
        state TEXT NOT NULL,
        content TEXT
      );
      CREATE TABLE [kb_kb_a_3] (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk TEXT,
        is_enable BOOLEAN,
        type TEXT,
        embedding F32_BLOB(3),
        metadata TEXT DEFAULT '{}'
      );
      CREATE TABLE [kb_kb_b_5] (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk TEXT,
        is_enable BOOLEAN,
        type TEXT,
        embedding F32_BLOB(5),
        metadata TEXT DEFAULT '{}'
      );
      CREATE TABLE unrelated (
        id TEXT PRIMARY KEY
      );
    `);

    db.prepare(
      'INSERT INTO knowledgebase (id, name, vectorLength) VALUES (?, ?, ?)',
    ).run('kb_a', 'A', 3);
    db.prepare(
      'INSERT INTO knowledgebase (id, name, vectorLength) VALUES (?, ?, ?)',
    ).run('kb_b', 'B', 5);
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_a_1', 'kb_a', 'Item A 1', 'completed', 'content a 1');
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_a_2', 'kb_a', 'Item A 2', 'fail', 'content a 2');
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_b_1', 'kb_b', 'Item B 1', 'completed', 'content b 1');
    db.prepare(
      'INSERT INTO [kb_kb_a_3] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'chunk_a_1',
      'item_a_1',
      'chunk a 1',
      1,
      'text',
      Buffer.from([1, 2, 3]),
      '{"a":1}',
    );
    db.prepare(
      'INSERT INTO [kb_kb_a_3] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'chunk_a_2',
      'item_a_2',
      'chunk a 2',
      1,
      'text',
      Buffer.from([4, 5, 6]),
      '{"a":2}',
    );
    db.prepare(
      'INSERT INTO [kb_kb_b_5] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'chunk_b_1',
      'item_b_1',
      'chunk b 1',
      1,
      'text',
      Buffer.from([7, 8, 9]),
      '{"b":1}',
    );
    db.prepare('INSERT INTO unrelated (id) VALUES (?)').run('unrelated');
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exports only completed items and their vector rows', () => {
    exportKnowledgeBaseSQLite({
      sourceDbPath: sourcePath,
      targetDbPath: targetPath,
      kbId: 'kb_a',
      vectorLength: 3,
    });

    const exported = new Database(targetPath, { readonly: true });
    const tableNames = exported
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row: { name: string }) => row.name);

    expect(tableNames).toEqual([
      'kb_kb_a_3',
      'knowledgebase',
      'knowledgebase_item',
    ]);
    expect(
      exported.prepare('SELECT id FROM knowledgebase ORDER BY id').all(),
    ).toEqual([{ id: 'kb_a' }]);
    expect(
      exported
        .prepare(
          'SELECT id, knowledgeBaseId FROM knowledgebase_item ORDER BY id',
        )
        .all(),
    ).toEqual([{ id: 'item_a_1', knowledgeBaseId: 'kb_a' }]);
    expect(
      exported
        .prepare('SELECT id, item_id, chunk FROM [kb_kb_a_3] ORDER BY id')
        .all(),
    ).toEqual([{ id: 'chunk_a_1', item_id: 'item_a_1', chunk: 'chunk a 1' }]);
    exported.close();
  });

  it('exports with a replacement knowledge base id when provided', () => {
    exportKnowledgeBaseSQLite({
      sourceDbPath: sourcePath,
      targetDbPath: targetPath,
      kbId: 'kb_a',
      vectorLength: 3,
      exportKbId: 'kb_copy',
    });

    const exported = new Database(targetPath, { readonly: true });
    const tableNames = exported
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row: { name: string }) => row.name);

    expect(tableNames).toEqual([
      'kb_kb_copy_3',
      'knowledgebase',
      'knowledgebase_item',
    ]);
    expect(exported.prepare('SELECT id FROM knowledgebase').all()).toEqual([
      { id: 'kb_copy' },
    ]);
    expect(
      exported
        .prepare('SELECT id, knowledgeBaseId FROM knowledgebase_item')
        .all(),
    ).toEqual([{ id: 'item_a_1', knowledgeBaseId: 'kb_copy' }]);
    expect(
      exported.prepare('SELECT id, item_id FROM [kb_kb_copy_3]').all(),
    ).toEqual([{ id: 'chunk_a_1', item_id: 'item_a_1' }]);
    exported.close();
  });

  it('replaces an existing target file', () => {
    fs.writeFileSync(targetPath, 'not sqlite');

    exportKnowledgeBaseSQLite({
      sourceDbPath: sourcePath,
      targetDbPath: targetPath,
      kbId: 'kb_a',
      vectorLength: 3,
    });

    const exported = new Database(targetPath, { readonly: true });
    expect(
      exported.prepare('SELECT COUNT(*) as count FROM knowledgebase').get(),
    ).toEqual({
      count: 1,
    });
    exported.close();
  });
});
