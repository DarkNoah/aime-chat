# Knowledge Base SQLite Export Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add knowledge base SQLite export/import, including completed-only export, optional export id, and duplicate-id import handling.

**Architecture:** Keep database copy logic in main-process helpers so it can be unit tested with real SQLite files. Expose export and import through KnowledgeBase IPC channels, then add renderer controls for export id selection, import file selection, and duplicate-id conflict resolution.

**Tech Stack:** Electron IPC, React, TypeScript, TypeORM repositories, better-sqlite3, Jest.

---

### Task 1: Export Helper

**Files:**

- Modify: `src/main/knowledge-base/export-sqlite.ts`
- Test: `src/main/knowledge-base/__tests__/export-sqlite.test.ts`

- [ ] Write failing Jest tests that create a source SQLite database with `knowledgebase`, `knowledgebase_item`, completed and failed items, two `kb_*` tables, and unrelated tables.
- [ ] Run `npm test -- src/main/knowledge-base/__tests__/export-sqlite.test.ts` and verify the expected failure.
- [ ] Implement `exportKnowledgeBaseSQLite({ sourceDbPath, targetDbPath, kbId, vectorLength, exportKbId })` by creating the three expected tables from source schema, copying only completed items, copying only matching vector rows, and rewriting `knowledgebase.id`, `knowledgebase_item.knowledgeBaseId`, and the vector table name when `exportKbId` differs.
- [ ] Re-run the focused test and verify it passes or record the known native module ABI blocker.

### Task 2: Import Helper

**Files:**

- Create: `src/main/knowledge-base/import-sqlite.ts`
- Test: `src/main/knowledge-base/__tests__/import-sqlite.test.ts`

- [ ] Write failing Jest tests for single-knowledge-base validation, vectorLength mismatch, overwrite mode, and append mode item-id skipping.
- [ ] Implement `inspectKnowledgeBaseSQLite(importDbPath)` to validate the file and return `{ id, name, vectorLength }`.
- [ ] Implement `importKnowledgeBaseSQLite({ sourceDbPath, targetDbPath, mode })` where `mode` is `overwrite` or `append`.
- [ ] In overwrite mode, drop the current vector table, delete current metadata/items, recreate imported schema, and copy imported rows exactly.
- [ ] In append mode, require equal `vectorLength`, keep the current knowledge base row, insert only missing item ids, and insert vector rows for those missing items.

### Task 3: IPC and Manager Integration

**Files:**

- Modify: `src/types/ipc-channel.ts`
- Modify: `src/main/knowledge-base/index.ts`
- Modify: `src/main/preload.ts`

- [ ] Add `KnowledgeBaseChannel.InspectSQLite` and `KnowledgeBaseChannel.ImportSQLite`.
- [ ] Change `KnowledgeBaseManager.exportSQLite(id, targetPath, exportKbId?)`.
- [ ] Add `KnowledgeBaseManager.inspectSQLite(sourcePath)` and `KnowledgeBaseManager.importSQLite(sourcePath, mode)`.
- [ ] Expose export, inspect, and import methods in preload.

### Task 4: Renderer Controls

**Files:**

- Modify: `src/renderer/pages/KnowledgeBase/detail.tsx`
- Modify: `src/renderer/pages/KnowledgeBase/index.tsx`

- [ ] Add an export-id dialog before the save dialog, defaulting to the current knowledge base id.
- [ ] Add an `Import SQLite` icon button on the knowledge base list page.
- [ ] On import, select a `.sqlite/.db` file, inspect it, detect duplicate ids from the current list, prompt overwrite/append when needed, import, refresh, and navigate to the imported knowledge base.

### Task 5: Verification

**Files:**

- All modified files

- [ ] Run the focused Jest tests.
- [ ] Run `npm run build:main`.
- [ ] Run `npm run build:renderer`.
- [ ] Report exact commands and outcomes.
