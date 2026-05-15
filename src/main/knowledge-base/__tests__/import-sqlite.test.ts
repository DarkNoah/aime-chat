import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import {
  importKnowledgeBaseSQLite,
  inspectKnowledgeBaseSQLite,
} from '../import-sqlite';

describe('knowledge base sqlite import', () => {
  let tempDir: string;
  let appDbPath: string;
  let importDbPath: string;

  const createKnowledgeBaseSchema = (db: Database.Database) => {
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
    `);
  };

  const createImportFile = (options?: { vectorLength?: number }) => {
    const vectorLength = options?.vectorLength ?? 3;
    const db = new Database(importDbPath);
    createKnowledgeBaseSchema(db);
    db.exec(`
      CREATE TABLE [kb_kb_a_${vectorLength}] (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk TEXT,
        is_enable BOOLEAN,
        type TEXT,
        embedding F32_BLOB(${vectorLength}),
        metadata TEXT DEFAULT '{}'
      );
    `);
    db.prepare(
      'INSERT INTO knowledgebase (id, name, vectorLength) VALUES (?, ?, ?)',
    ).run('kb_a', 'Imported KB', vectorLength);
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_1', 'kb_a', 'Imported 1', 'completed', 'content 1');
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_2', 'kb_a', 'Imported 2', 'completed', 'content 2');
    db.prepare(
      `INSERT INTO [kb_kb_a_${vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'chunk_1',
      'item_1',
      'chunk 1',
      1,
      'text',
      Buffer.from([1, 2, 3]),
      '{}',
    );
    db.prepare(
      `INSERT INTO [kb_kb_a_${vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'chunk_2',
      'item_2',
      'chunk 2',
      1,
      'text',
      Buffer.from([4, 5, 6]),
      '{}',
    );
    db.close();
  };

  const createAppDatabaseWithExistingKb = () => {
    const db = new Database(appDbPath);
    createKnowledgeBaseSchema(db);
    db.exec(`
      CREATE TABLE [kb_kb_a_3] (
        id TEXT PRIMARY KEY,
        item_id TEXT,
        chunk TEXT,
        is_enable BOOLEAN,
        type TEXT,
        embedding F32_BLOB(3),
        metadata TEXT DEFAULT '{}'
      );
    `);
    db.prepare(
      'INSERT INTO knowledgebase (id, name, vectorLength) VALUES (?, ?, ?)',
    ).run('kb_a', 'Existing KB', 3);
    db.prepare(
      'INSERT INTO knowledgebase_item (id, knowledgeBaseId, name, state, content) VALUES (?, ?, ?, ?, ?)',
    ).run('item_1', 'kb_a', 'Existing 1', 'completed', 'existing content');
    db.prepare(
      'INSERT INTO [kb_kb_a_3] (id, item_id, chunk, is_enable, type, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'existing_chunk',
      'item_1',
      'existing chunk',
      1,
      'text',
      Buffer.from([9]),
      '{}',
    );
    db.close();
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aime-kb-import-'));
    appDbPath = path.join(tempDir, 'app.sqlite');
    importDbPath = path.join(tempDir, 'import.sqlite');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('inspects a single knowledge base export file', () => {
    createImportFile();

    expect(inspectKnowledgeBaseSQLite(importDbPath)).toEqual({
      id: 'kb_a',
      name: 'Imported KB',
      vectorLength: 3,
      itemCount: 2,
    });
  });

  it('rejects files with more than one knowledge base row', () => {
    createImportFile();
    const db = new Database(importDbPath);
    db.prepare(
      'INSERT INTO knowledgebase (id, name, vectorLength) VALUES (?, ?, ?)',
    ).run('kb_b', 'Other KB', 3);
    db.close();

    expect(() => inspectKnowledgeBaseSQLite(importDbPath)).toThrow(
      'single knowledge base',
    );
  });

  it('overwrites an existing knowledge base completely', () => {
    createAppDatabaseWithExistingKb();
    createImportFile();

    importKnowledgeBaseSQLite({
      appDbPath,
      importDbPath,
      mode: 'overwrite',
    });

    const db = new Database(appDbPath, { readonly: true });
    expect(
      db.prepare('SELECT name FROM knowledgebase WHERE id = ?').get('kb_a'),
    ).toEqual({
      name: 'Imported KB',
    });
    expect(
      db.prepare('SELECT id, name FROM knowledgebase_item ORDER BY id').all(),
    ).toEqual([
      { id: 'item_1', name: 'Imported 1' },
      { id: 'item_2', name: 'Imported 2' },
    ]);
    expect(
      db.prepare('SELECT id, item_id FROM [kb_kb_a_3] ORDER BY id').all(),
    ).toEqual([
      { id: 'chunk_1', item_id: 'item_1' },
      { id: 'chunk_2', item_id: 'item_2' },
    ]);
    db.close();
  });

  it('appends only missing item ids and their vector rows', () => {
    createAppDatabaseWithExistingKb();
    createImportFile();

    importKnowledgeBaseSQLite({
      appDbPath,
      importDbPath,
      mode: 'append',
    });

    const db = new Database(appDbPath, { readonly: true });
    expect(
      db.prepare('SELECT id, name FROM knowledgebase_item ORDER BY id').all(),
    ).toEqual([
      { id: 'item_1', name: 'Existing 1' },
      { id: 'item_2', name: 'Imported 2' },
    ]);
    expect(
      db.prepare('SELECT id, item_id FROM [kb_kb_a_3] ORDER BY id').all(),
    ).toEqual([
      { id: 'chunk_2', item_id: 'item_2' },
      { id: 'existing_chunk', item_id: 'item_1' },
    ]);
    db.close();
  });

  it('rejects append when vector length differs', () => {
    createAppDatabaseWithExistingKb();
    createImportFile({ vectorLength: 5 });

    expect(() =>
      importKnowledgeBaseSQLite({
        appDbPath,
        importDbPath,
        mode: 'append',
      }),
    ).toThrow('vectorLength');
  });
});
