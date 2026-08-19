import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { KnowledgeBaseChannel } from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  KnowledgeBaseEvent,
  KnowledgeBaseItemState,
  KnowledgeBaseReembeddingProgress,
  KnowledgeBaseSQLiteImportMode,
  KnowledgeBaseSQLiteInfo,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseItemResult,
  SearchKnowledgeBaseResult,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import { In, Repository } from 'typeorm';
import { Client as LibSQLClient, Value } from '@libsql/client';
import { createGraphRAGTool, MDocument } from '@mastra/rag';
import type { EmbeddingModelV2 } from '@ai-sdk/provider';
import { nanoid } from '@/utils/nanoid';
import { providersManager } from '../providers';
import { isUrl } from '@/utils/is';
import fs from 'fs';
import { taskQueueManager, TaskContext } from '../task-queue';
import { BackgroundTask } from '@/types/task-queue';
import { WebFetch } from '../tools/web/web-fetch';
import { getDbPath } from '../utils';
import { PaginationInfo, PaginationParams } from '@/types/common';
import path from 'path';
import { isBinaryFile } from 'isbinaryfile';
import { ReadBinaryFile } from '../tools/file-system/read';
import { appManager } from '../app';
import { toolsManager } from '../tools';
import { ToolType } from '@/types/tool';
import localModels from '../local-model/models.json';
import mime from 'mime';
import { LocalCLIPModel } from '../local-model/clip';
import { exportKnowledgeBaseSQLite } from './export-sqlite';
import { importKnowledgeBaseSQLite, inspectKnowledgeBaseSQLite } from './import-sqlite';
import {
  backfillFtsTable,
  buildMatchQuery,
  createFtsTable,
  dropFtsTable,
  ftsTableExists,
  getFtsTableName,
  rrfFuse,
  segmentText,
} from './fts';
import {
  createKnowledgeBaseGraphVectorStore,
  getKnowledgeBaseGraphIndexName,
} from '../tools/knowledge-base/graph-vector-store';

type KnowledgeBaseChunk = {
  text: string;
  metadata?: Record<string, unknown>;
};

type ExtendColumnValue = {
  column: string;
  value: any;
};

type VectorTableColumn = {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: Value;
  primaryKey: boolean;
};

type ReembeddingRow = {
  values: Record<string, Value>;
  embedding?: number[];
};

const REEMBEDDING_BATCH_SIZE = 32;

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const vectorTableName = (kbId: string, vectorLength: number): string =>
  `kb_${kbId}_${vectorLength}`;

const valuesEqual = (left: Value, right: Value): boolean => {
  if (left instanceof ArrayBuffer && right instanceof ArrayBuffer) {
    const leftBytes = new Uint8Array(left);
    const rightBytes = new Uint8Array(right);
    return (
      leftBytes.length === rightBytes.length &&
      leftBytes.every((value, index) => value === rightBytes[index])
    );
  }
  return left === right;
};

const rowsEqual = (
  left: Record<string, Value>[],
  right: Record<string, Value>[],
  columns: string[],
): boolean =>
  left.length === right.length &&
  left.every((row, rowIndex) =>
    columns.every((column) =>
      valuesEqual(row[column], right[rowIndex][column]),
    ),
  );

export class KnowledgeBaseManager extends BaseManager {
  knowledgeBaseRepository: Repository<KnowledgeBase>;
  knowledgeBaseItemRepository: Repository<KnowledgeBaseItem>;
  libSQLClient: LibSQLClient;
  private activeReembeddings = new Set<string>();
  private windowWasClosable: boolean | undefined;
  public async init() {
    this.knowledgeBaseRepository =
      dbManager.dataSource.getRepository(KnowledgeBase);
    this.knowledgeBaseItemRepository =
      dbManager.dataSource.getRepository(KnowledgeBaseItem);
    this.libSQLClient = dbManager.getLocalLibSQLClient();
    void this.ensureFtsIndexes();

    // 注册知识库导入的后台任务 handler
    taskQueueManager.registerHandler('kb-import', {
      execute: async (task: BackgroundTask, ctx: TaskContext) => {
        await this.executeImportSource(task, ctx);
      },
    });

    // Try to ensure the global static memory KB exists. Done lazily so we
    // don't block app boot if no embedding provider is configured yet.
    setTimeout(() => {
      import('./static-memory')
        .then((m) => m.getOrCreateMemoryKB())
        .catch((err) => console.error('[knowledge-base] init static memory failed', err));
    }, 0);
  }


  isLocalModel(modelId: string) {
    return modelId?.startsWith('local/');
  }

  isLocalClipModel(modelId: string) {
    const _modelId = modelId.split('/').slice(1).join('/')
    const localEmbeddingModel = localModels.embedding.find(x => x.id === _modelId);
    const localClipModel = localModels.clip.find(x => x.id === _modelId);
    return localClipModel !== undefined;
  }
  async calcEmbeddings(modeId: string, texts: string[], images?: string[]): Promise<{ text_embeddings: number[][], image_embeddings?: number[][] } | undefined> {
    try {
      if (this.isLocalModel(modeId)) {
        const _modelId = modeId.split('/').slice(1).join('/')
        if (this.isLocalClipModel(modeId)) {
          const appInfo = await appManager.getInfo();
          const modelPath = path.join(appInfo.modelPath, 'clip', _modelId);
          const model = new LocalCLIPModel(_modelId, modelPath);
          let text_embeddings: number[][] = [];
          if (texts && texts.length > 0) {
            text_embeddings = (await model.encodeTexts(texts)).map(x => Array.from(x));
          }
          let image_embeddings: number[][] = [];
          if (images && images.length > 0) {
            image_embeddings = (await model.encodeImages(images ? images : undefined)).map(x => Array.from(x));
          }

          return { text_embeddings: text_embeddings, image_embeddings: image_embeddings };
        }
      }

      const embeddingModel = await providersManager.getEmbeddingModel(modeId);

      let text_embeddings: number[][] = [];
      for (const text of texts) {
        const res = await embeddingModel.doEmbed({ values: [text] });
        text_embeddings.push(res.embeddings[0]);
      }
      return { text_embeddings: text_embeddings, image_embeddings: undefined };
    } catch (err) {
      console.error(err);
    }
    return undefined
  }

  private async getGraphEmbeddingModel(
    modelId: string,
    onEmbedding?: (embedding: number[]) => void,
  ): Promise<EmbeddingModelV2<string> | undefined> {
    if (!this.isLocalClipModel(modelId)) {
      return providersManager.getEmbeddingModel(modelId);
    }

    return {
      specificationVersion: 'v2',
      provider: 'local',
      modelId,
      maxEmbeddingsPerCall: 2048,
      supportsParallelCalls: true,
      doEmbed: async ({ values }) => {
        const result = await this.calcEmbeddings(modelId, values);
        const embeddings = result?.text_embeddings;
        if (!embeddings || embeddings.length !== values.length) {
          throw new Error(
            `Embedding model ${modelId} returned an unexpected result count`,
          );
        }
        if (embeddings[0]) {
          onEmbedding?.(embeddings[0]);
        }
        return {
          embeddings,
          usage: { tokens: 0 },
        };
      },
    };
  }

  async calcClipCosineSimilarity(modeId: string, embedding1: number[], embedding2: number[]): Promise<number> {
    const appInfo = await appManager.getInfo();
    const modelPath = path.join(appInfo.modelPath, 'clip', modeId);
    const model = new LocalCLIPModel(modeId, modelPath);
    return model.cosineSimilarity(new Float32Array(embedding1), new Float32Array(embedding2));
  }

  private assertKnowledgeBaseNotReembedding(kbId: string): void {
    if (this.activeReembeddings.has(kbId)) {
      throw new Error('Knowledge base is being re-embedded');
    }
  }

  private setWindowLockedForReembedding(locked: boolean): void {
    try {
      const mainWindow = appManager.getMainWindow?.();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (locked && this.activeReembeddings.size === 1) {
        this.windowWasClosable = mainWindow.isClosable();
        mainWindow.setClosable(false);
      } else if (!locked && this.activeReembeddings.size === 0) {
        mainWindow.setClosable(this.windowWasClosable ?? true);
        this.windowWasClosable = undefined;
      }
    } catch (error) {
      console.error('[knowledge-base] failed to update window close state', error);
    }
  }

  private async sendReembeddingProgress(
    progress: KnowledgeBaseReembeddingProgress,
  ): Promise<void> {
    try {
      await appManager.sendEvent(
        KnowledgeBaseEvent.ReembeddingProgress,
        progress,
      );
    } catch (error) {
      console.error(
        '[knowledge-base] failed to send re-embedding progress',
        error,
      );
    }
  }

  private validateEmbeddingBatch(
    embeddings: number[][] | undefined,
    expectedCount: number,
    currentDimension: number,
  ): number {
    if (!embeddings || embeddings.length !== expectedCount) {
      throw new Error(
        'Embedding generation returned an unexpected result count',
      );
    }

    let dimension = currentDimension;
    for (const embedding of embeddings) {
      if (
        embedding.length === 0 ||
        embedding.some((value) => !Number.isFinite(value))
      ) {
        throw new Error('Embedding generation returned an invalid vector');
      }
      if (dimension === 0) {
        dimension = embedding.length;
      } else if (embedding.length !== dimension) {
        throw new Error(
          'Embedding generation returned inconsistent vector dimensions',
        );
      }
    }
    return dimension;
  }

  private async reembedKnowledgeBase(
    kb: KnowledgeBase,
    data: UpdateKnowledgeBase,
    embedding: string | undefined,
  ): Promise<KnowledgeBase> {
    this.assertKnowledgeBaseNotReembedding(kb.id);
    this.activeReembeddings.add(kb.id);
    this.setWindowLockedForReembedding(true);

    try {
      const activeImports = (
        await taskQueueManager.getTasksByGroup(`kb-import-${kb.id}`)
      ).filter((task) =>
        ['pending', 'running', 'paused'].includes(task.status),
      );
      if (activeImports.length > 0) {
        throw new Error(
          'Wait for all knowledge base imports to finish before changing the embedding model',
        );
      }

      await this.sendReembeddingProgress({
        kbId: kb.id,
        completed: 0,
        total: 0,
        progress: 0,
        stage: 'preparing',
      });

      const oldTable = vectorTableName(kb.id, kb.vectorLength ?? 0);
      const schemaResult = await this.libSQLClient.execute(
        `PRAGMA table_info(${quoteIdentifier(oldTable)})`,
      );
      const schema: VectorTableColumn[] = schemaResult.rows.map((row) => ({
        name: String(row.name),
        type: String(row.type ?? ''),
        notNull: Number(row.notnull) === 1,
        defaultValue: row.dflt_value as Value,
        primaryKey: Number(row.pk) > 0,
      }));
      if (schema.length === 0) {
        throw new Error('Knowledge base vector table not found');
      }

      const sourceColumns = schema
        .map((column) => column.name)
        .filter((name) => name !== 'embedding');
      const sourceSelect = sourceColumns.map(quoteIdentifier).join(', ');
      const sourceResult = await this.libSQLClient.execute(
        `SELECT ${sourceSelect} FROM ${quoteIdentifier(oldTable)} ORDER BY ${quoteIdentifier('id')}`,
      );
      const sourceRows = sourceResult.rows.map((row) =>
        Object.fromEntries(
          sourceColumns.map((column) => [column, row[column] as Value]),
        ),
      );
      const cachedRows: ReembeddingRow[] = sourceRows.map((values) => ({
        values,
      }));

      let completed = 0;
      let vectorLength = 0;
      const reportEmbeddingProgress = async () => {
        await this.sendReembeddingProgress({
          kbId: kb.id,
          completed,
          total: cachedRows.length,
          progress:
            cachedRows.length === 0
              ? 85
              : Math.round(5 + (completed / cachedRows.length) * 80),
          stage: 'embedding',
        });
      };

      if (embedding) {
        const textRows = cachedRows.filter(
          (row) => String(row.values.type ?? 'text') !== 'image',
        );
        for (
          let offset = 0;
          offset < textRows.length;
          offset += REEMBEDDING_BATCH_SIZE
        ) {
          const batch = textRows.slice(offset, offset + REEMBEDDING_BATCH_SIZE);
          const texts = batch.map((row) => {
            if (typeof row.values.chunk !== 'string') {
              throw new Error('A text chunk has no content to embed');
            }
            return row.values.chunk;
          });
          const result = await this.calcEmbeddings(embedding, texts);
          vectorLength = this.validateEmbeddingBatch(
            result?.text_embeddings,
            batch.length,
            vectorLength,
          );
          batch.forEach((row, index) => {
            row.embedding = result!.text_embeddings[index];
          });
          completed += batch.length;
          await reportEmbeddingProgress();
        }

        const imageRows = cachedRows.filter(
          (row) => String(row.values.type ?? '') === 'image',
        );
        if (imageRows.length > 0) {
          const items = await this.knowledgeBaseItemRepository.find({
            where: { knowledgeBaseId: kb.id },
          });
          const imageSources = new Map(
            items.map((item) => [item.id, item.source]),
          );

          for (
            let offset = 0;
            offset < imageRows.length;
            offset += REEMBEDDING_BATCH_SIZE
          ) {
            const batch = imageRows.slice(
              offset,
              offset + REEMBEDDING_BATCH_SIZE,
            );
            const paths = batch.map((row) => {
              const itemId = String(row.values.item_id ?? '');
              const source = imageSources.get(itemId);
              if (typeof source !== 'string' || source.length === 0) {
                throw new Error(
                  `Image source is unavailable for item ${itemId}`,
                );
              }
              return source;
            });
            const result = await this.calcEmbeddings(embedding, [], paths);
            vectorLength = this.validateEmbeddingBatch(
              result?.image_embeddings,
              batch.length,
              vectorLength,
            );
            batch.forEach((row, index) => {
              row.embedding = result!.image_embeddings![index];
            });
            completed += batch.length;
            await reportEmbeddingProgress();
          }
        }

        if (cachedRows.length === 0) {
          const result = await this.calcEmbeddings(embedding, ['Hello']);
          vectorLength = this.validateEmbeddingBatch(
            result?.text_embeddings,
            1,
            vectorLength,
          );
          await reportEmbeddingProgress();
        }
      } else {
        completed = cachedRows.length;
        await reportEmbeddingProgress();
      }

      await this.sendReembeddingProgress({
        kbId: kb.id,
        completed,
        total: cachedRows.length,
        progress: 90,
        stage: 'committing',
      });

      const targetSchema = schema.filter(
        (column) => column.name !== 'embedding',
      );
      if (embedding) {
        const metadataIndex = targetSchema.findIndex(
          (column) => column.name === 'metadata',
        );
        targetSchema.splice(
          metadataIndex < 0 ? targetSchema.length : metadataIndex,
          0,
          {
            name: 'embedding',
            type: `F32_BLOB(${vectorLength})`,
            notNull: false,
            defaultValue: null,
            primaryKey: false,
          },
        );
      }

      const createColumns = targetSchema.map((column) => {
        if (!/^[A-Za-z0-9_(), ]*$/.test(column.type)) {
          throw new Error(
            `Unsupported vector table column type: ${column.type}`,
          );
        }
        const defaultSql =
          column.defaultValue === null ||
            typeof column.defaultValue === 'undefined'
            ? ''
            : ` DEFAULT ${String(column.defaultValue)}`;
        return `${quoteIdentifier(column.name)} ${column.type}${column.notNull ? ' NOT NULL' : ''
          }${defaultSql}${column.primaryKey ? ' PRIMARY KEY' : ''}`;
      });
      const targetTable = vectorTableName(kb.id, vectorLength);
      const temporaryTable = `kb_reembed_${kb.id}_${nanoid()}`;
      const transaction = await this.libSQLClient.transaction('write');

      try {
        const currentResult = await transaction.execute(
          `SELECT ${sourceSelect} FROM ${quoteIdentifier(oldTable)} ORDER BY ${quoteIdentifier('id')}`,
        );
        const currentRows = currentResult.rows.map((row) =>
          Object.fromEntries(
            sourceColumns.map((column) => [column, row[column] as Value]),
          ),
        );
        if (!rowsEqual(sourceRows, currentRows, sourceColumns)) {
          throw new Error(
            'Knowledge base content changed while embeddings were being generated',
          );
        }

        await transaction.execute(
          `CREATE TABLE ${quoteIdentifier(temporaryTable)} (${createColumns.join(', ')})`,
        );

        const targetColumns = targetSchema.map((column) => column.name);
        const insertSql = `INSERT INTO ${quoteIdentifier(temporaryTable)} (${targetColumns
          .map(quoteIdentifier)
          .join(', ')}) VALUES (${targetColumns
            .map((column) => (column === 'embedding' ? 'vector32(?)' : '?'))
            .join(', ')})`;
        for (
          let offset = 0;
          offset < cachedRows.length;
          offset += REEMBEDDING_BATCH_SIZE
        ) {
          const batch = cachedRows.slice(
            offset,
            offset + REEMBEDDING_BATCH_SIZE,
          );
          await transaction.batch(
            batch.map((row) => ({
              sql: insertSql,
              args: targetColumns.map((column) =>
                column === 'embedding'
                  ? JSON.stringify(row.embedding)
                  : row.values[column],
              ),
            })),
          );
        }

        const updateClauses = [
          'name = ?',
          'description = ?',
          'embedding = ?',
          'vectorLength = ?',
          'updatedAt = CURRENT_TIMESTAMP',
        ];
        const updateArgs: any[] = [
          data.name,
          data.description ?? kb.description ?? '',
          embedding ?? null,
          vectorLength,
        ];
        if (typeof data.reranker !== 'undefined') {
          updateClauses.push('reranker = ?');
          updateArgs.push(data.reranker);
        }
        if (typeof data.forceReturnFullContent !== 'undefined') {
          updateClauses.push('forceReturnFullContent = ?');
          updateArgs.push(data.forceReturnFullContent);
        }
        if (typeof data.tags !== 'undefined') {
          updateClauses.push('tags = ?');
          updateArgs.push(JSON.stringify(data.tags));
        }
        updateArgs.push(kb.id);

        if (targetTable !== oldTable) {
          await transaction.execute(
            `DROP TABLE IF EXISTS ${quoteIdentifier(targetTable)}`,
          );
        }
        await transaction.execute(`DROP TABLE ${quoteIdentifier(oldTable)}`);
        await transaction.execute(
          `ALTER TABLE ${quoteIdentifier(temporaryTable)} RENAME TO ${quoteIdentifier(targetTable)}`,
        );
        await transaction.execute({
          sql: `UPDATE knowledgebase SET ${updateClauses.join(', ')} WHERE id = ?`,
          args: updateArgs,
        });
        await transaction.commit();
      } catch (error) {
        if (!transaction.closed) {
          await transaction.rollback();
        }
        throw error;
      } finally {
        transaction.close();
      }

      await this.sendReembeddingProgress({
        kbId: kb.id,
        completed: cachedRows.length,
        total: cachedRows.length,
        progress: 100,
        stage: 'completed',
      });
      return await this.getKnowledgeBase(kb.id);
    } finally {
      this.activeReembeddings.delete(kb.id);
      this.setWindowLockedForReembedding(false);
    }
  }

  private async ensureFtsIndexes(): Promise<void> {
    try {
      const knowledgeBases = await this.knowledgeBaseRepository.find();
      for (const kb of knowledgeBases) {
        await this.ensureFtsIndex(kb);
      }
    } catch (error) {
      console.error('[knowledge-base] ensure FTS indexes failed', error);
    }
  }

  private async ensureFtsIndex(kb: KnowledgeBase): Promise<void> {
    if (!(await ftsTableExists(this.libSQLClient, kb.id))) {
      await backfillFtsTable(
        this.libSQLClient,
        kb.id,
        kb.vectorLength ?? 0,
      );
    }
  }

  private async insertChunkRows(
    kb: KnowledgeBase,
    itemId: string,
    chunks: KnowledgeBaseChunk[],
    embeddings?: number[][],
    extendColumns: ExtendColumnValue[] = [],
  ): Promise<void> {
    if (chunks.length === 0) return;
    await this.ensureFtsIndex(kb);
    if (kb.embedding && embeddings?.length !== chunks.length) {
      throw new Error('Embedding generation failed');
    }

    const vectorTable = `kb_${kb.id}_${kb.vectorLength ?? 0}`;
    const ftsTable = getFtsTableName(kb.id);
    const statements = chunks.flatMap((chunk, index) => {
      const chunkId = nanoid();
      const commonArgs = [chunkId, itemId, chunk.text, true, 'text'];
      const metadata = JSON.stringify(chunk.metadata ?? {});
      const extendColumnNames = extendColumns
        .map((column) => `"${column.column.replace(/"/g, '""')}"`)
        .join(', ');
      const extendPlaceholders = extendColumns.map(() => '?').join(', ');
      const vectorStatement = kb.embedding
        ? {
          sql: `INSERT INTO [${vectorTable}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumnNames ? `, ${extendColumnNames}` : ''})
              VALUES (?, ?, ?, ?, ?, vector32(?), ?${extendPlaceholders ? `, ${extendPlaceholders}` : ''})`,
          args: [
            ...commonArgs,
            JSON.stringify(embeddings[index]),
            metadata,
            ...extendColumns.map((column) => column.value),
          ],
        }
        : {
          sql: `INSERT INTO [${vectorTable}] (id, item_id, chunk, is_enable, type, metadata${extendColumnNames ? `, ${extendColumnNames}` : ''})
              VALUES (?, ?, ?, ?, ?, ?${extendPlaceholders ? `, ${extendPlaceholders}` : ''})`,
          args: [
            ...commonArgs,
            metadata,
            ...extendColumns.map((column) => column.value),
          ],
        };

      return [
        vectorStatement,
        {
          sql: `INSERT INTO [${ftsTable}] (chunk_id, chunk_text) VALUES (?, ?)`,
          args: [chunkId, segmentText(chunk.text)],
        },
      ];
    });

    await this.libSQLClient.batch(statements);
  }

  private async deleteChunkRows(
    kb: KnowledgeBase,
    itemId: string,
    textOnly = false,
  ): Promise<void> {
    await this.ensureFtsIndex(kb);
    const vectorTable = `kb_${kb.id}_${kb.vectorLength ?? 0}`;
    const ftsTable = getFtsTableName(kb.id);
    const typeCondition = textOnly
      ? ` AND ("type" IS NULL OR "type" = 'text')`
      : '';
    await this.libSQLClient.batch([
      {
        sql: `DELETE FROM [${ftsTable}]
          WHERE chunk_id IN (
            SELECT id FROM [${vectorTable}] WHERE item_id = ?${typeCondition}
          )`,
        args: [itemId],
      },
      {
        sql: `DELETE FROM [${vectorTable}] WHERE item_id = ?${typeCondition}`,
        args: [itemId],
      },
    ]);
  }

  @channel(KnowledgeBaseChannel.Create)
  public async createKnowledgeBase(data: CreateKnowledgeBase & { id?: string; static?: boolean }): Promise<KnowledgeBase> {
    const kbId = data.id ?? nanoid();
    const embedding = data.embedding?.trim() || undefined;
    let embedding_length = 0;
    if (embedding) {
      const result = await this.calcEmbeddings(embedding, ['Hello']);
      const embeddings = result?.text_embeddings;
      embedding_length =
        embeddings?.length === 1 ? embeddings[0].length : 0;
      if (embedding_length === 0) {
        throw new Error('Error: Embedding length is 0');
      }
    }
    let extendColumns = [];
    if (data?.vectorStoreConfig?.extendColumns && data?.vectorStoreConfig?.extendColumns.length > 0) {
      extendColumns = data.vectorStoreConfig.extendColumns.map(x => {
        let columnType = 'TEXT';
        switch (x.columnType) {
          case 'text':
            columnType = 'TEXT';
            break;
          case 'blob':
            columnType = 'BLOB';
            break;
          case 'number':
            columnType = 'NUMBER';
            break;
          case 'boolean':
            columnType = 'BOOLEAN';
            break;
        }
        return `[${x.name}] ${columnType} NULL`
      })
    }

    await this.libSQLClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS [kb_${kbId}_${embedding_length}] (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      chunk TEXT NULL,
      is_enable BOOLEAN,
      type TEXT NULL,
      ${embedding ? `[embedding] F32_BLOB(${embedding_length}) NULL,` : ''}
      [metadata] TEXT NULL DEFAULT '{}'
      ${extendColumns.length > 0 ? `, ${extendColumns.join(',\n')}` : ''}

      )`,
      args: [],
    });
    await createFtsTable(this.libSQLClient, kbId);

    return await this.knowledgeBaseRepository.save({
      ...data,
      id: kbId,
      embedding,
      vectorLength: embedding_length,
      static: data.static ?? false,
    });
  }

  @channel(KnowledgeBaseChannel.Update)
  public async updateKnowledgeBase(
    id: string,
    data: UpdateKnowledgeBase,
  ): Promise<KnowledgeBase> {
    this.assertKnowledgeBaseNotReembedding(id);
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    const embeddingWasProvided = Object.prototype.hasOwnProperty.call(
      data,
      'embedding',
    );
    const nextEmbedding = embeddingWasProvided
      ? data.embedding?.trim() || undefined
      : kb.embedding;
    if (nextEmbedding !== kb.embedding) {
      if (!data.reembed) {
        throw new Error('Changing the embedding model requires re-embedding');
      }
      return await this.reembedKnowledgeBase(kb, data, nextEmbedding);
    }

    const { embedding: _embedding, reembed: _reembed, ...updates } = data;
    await this.knowledgeBaseRepository.update(id, updates);
    return await this.getKnowledgeBase(id);
  }

  @channel(KnowledgeBaseChannel.Delete)
  public async deleteKnowledgeBase(id: string) {
    this.assertKnowledgeBaseNotReembedding(id);
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    await this.libSQLClient.execute({
      sql: `DROP TABLE IF EXISTS [kb_${id}_${kb.vectorLength}]`,
      args: [],
    });
    await dropFtsTable(this.libSQLClient, id);
    await this.knowledgeBaseRepository.delete(id);
  }

  @channel(KnowledgeBaseChannel.Get)
  public async getKnowledgeBase(id: string): Promise<KnowledgeBase> {
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }

    let _kb: any = { ...kb }
    if (kb.embedding) {
      _kb.embeddingProvider = (await providersManager.getProvider(kb.embedding.split('/')[0]))?.name;
      _kb.embeddingModel = _kb.embeddingProvider + '/' + kb.embedding.split('/').slice(1).join('/');
      if (_kb.reranker) {
        _kb.rerankerProvider = (await providersManager.getProvider(kb.reranker.split('/')[0]))?.name;
        _kb.rerankerModel = _kb.rerankerProvider + '/' + kb.reranker.split('/').slice(1).join('/');
      }


    }

    return _kb;
  }

  @channel(KnowledgeBaseChannel.GetList)
  public async getKnowledgeBaseList() {
    const kbs = await this.knowledgeBaseRepository.find();
    return kbs;
  }

  @channel(KnowledgeBaseChannel.ExportSQLite)
  public async exportSQLite(id: string, targetPath: string, exportKbId?: string): Promise<string> {
    if (!targetPath?.trim()) {
      throw new Error('Export path is required');
    }
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    if (kb.vectorLength == null) {
      throw new Error('Knowledge base vector length is missing');
    }

    exportKnowledgeBaseSQLite({
      sourceDbPath: getDbPath(),
      targetDbPath: targetPath,
      kbId: kb.id,
      vectorLength: kb.vectorLength,
      exportKbId,
    });
    return targetPath;
  }

  @channel(KnowledgeBaseChannel.InspectSQLite)
  public async inspectSQLite(sourcePath: string): Promise<KnowledgeBaseSQLiteInfo> {
    if (!sourcePath?.trim()) {
      throw new Error('Import path is required');
    }
    return inspectKnowledgeBaseSQLite(sourcePath);
  }

  @channel(KnowledgeBaseChannel.ImportSQLite)
  public async importSQLite(sourcePath: string, mode: KnowledgeBaseSQLiteImportMode): Promise<KnowledgeBaseSQLiteInfo> {
    if (!sourcePath?.trim()) {
      throw new Error('Import path is required');
    }
    const imported = importKnowledgeBaseSQLite({
      appDbPath: getDbPath(),
      importDbPath: sourcePath,
      mode,
    });
    await backfillFtsTable(
      this.libSQLClient,
      imported.id,
      imported.vectorLength,
    );
    return imported;
  }


  @channel(KnowledgeBaseChannel.GetKnowledgeBaseItem)
  public async getKnowledgeBaseItem(id: string): Promise<KnowledgeBaseItem> {
    // const where: Record<string, any> = { knowledgeBaseId: id };

    const item = await this.knowledgeBaseItemRepository.findOneBy({ id });
    return item;
  }

  @channel(KnowledgeBaseChannel.GetKnowledgeBaseItems)
  public async getKnowledgeBaseItems(id: string, params: PaginationParams): Promise<PaginationInfo<KnowledgeBaseItem>> {
    const { page, size, filter, filters, sort, order } = params;
    const where: Record<string, any> = { knowledgeBaseId: id };
    if (filters?.state) {
      where.state = filters.state;
    }
    if (filters?.sourceType) {
      where.sourceType = filters.sourceType;
    }
    const [items, total] = await this.knowledgeBaseItemRepository.findAndCount({
      where,
      skip: (page - 1) * size,
      take: size,
      order: { [sort]: order },
    });

    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    // if (kb && items.length > 0) {
    //   const itemIds = items.map(item => item.id);
    //   const placeholders = itemIds.map(() => '?').join(',');
    //   const vectorResults = await this.libSQLClient.execute({
    //     sql: `SELECT item_id, chunk, metadata, type FROM [kb_${id}_${kb.vectorLength}] WHERE item_id IN (${placeholders}) AND type = 'image'`,
    //     args: itemIds,
    //   });

    //   const imageChunkMap = new Map<string, { chunk: string; metadata: any }>();
    //   for (const row of vectorResults.rows) {
    //     const itemId = row.item_id as string;
    //     if (!imageChunkMap.has(itemId)) {
    //       imageChunkMap.set(itemId, {
    //         chunk: row.chunk as string,
    //         metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    //       });
    //     }
    //   }

    //   for (const item of items) {
    //     const imageData = imageChunkMap.get(item.id);
    //     if (imageData) {
    //       (item as any).chunk = imageData.chunk;
    //       (item as any).metadata = { ...(item.metadata ?? {}), ...imageData.metadata };
    //     }
    //   }
    // }

    return {
      items: items,
      total: total,
      page: page,
      size: size,
      hasMore: total > page * size,
    };
  }
  @channel(KnowledgeBaseChannel.SearchKnowledgeBase)
  public async searchKnowledgeBase(kb_id_or_name: string, query: string, fileTpye: 'text' | 'image' = 'text', filter?: string, top_k: number = 10): Promise<SearchKnowledgeBaseResult> {
    if (!Number.isInteger(top_k) || top_k < 1 || top_k > 100) {
      throw new Error('top_k must be an integer between 1 and 100');
    }
    const kb = await this.knowledgeBaseRepository.findOne({ where: [{ id: kb_id_or_name }, { name: kb_id_or_name }] });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    await this.ensureFtsIndex(kb);
    const originalQuery = query;
    const { vectorStoreConfig } = kb;
    const candidateLimit = Math.max(top_k * 3, top_k);
    const extendSelect = vectorStoreConfig?.extendColumns?.length > 0
      ? `, ${vectorStoreConfig.extendColumns.map((column) => `"${column.name}"`).join(', ')}`
      : '';
    if (filter && !vectorStoreConfig?.extendColumns?.length) {
      throw new Error(
        'Knowledge base where requires at least one configured extended column',
      );
    }
    const filterCondition = filter ? ` AND (${filter})` : '';
    let vectorStr: number[] | undefined;
    let semanticSearchAvailable = false;
    const vectorRows: any[] = [];
    if (kb.embedding && fileTpye === 'text' && kb.vectorLength) {
      try {
        let embeddingQuery = originalQuery;
        if (kb.embedding.split('/').at(-1) === 'jina-clip-v2') {
          embeddingQuery = `Represent the query for retrieving evidence documents: ${originalQuery}`;
        }
        const model = await this.getGraphEmbeddingModel(
          kb.embedding,
          (embedding) => {
            vectorStr = embedding;
          },
        );
        if (!model) {
          throw new Error(`Embedding model is unavailable: ${kb.embedding}`);
        }
        const extendColumns =
          vectorStoreConfig?.extendColumns?.map((column) => column.name) ?? [];
        const graphTool = createGraphRAGTool({
          id: `KnowledgeBaseSearch-${kb.id}`,
          description:
            'Graph-based semantic retrieval for knowledge base search.',
          vectorStore: createKnowledgeBaseGraphVectorStore({
            client: this.libSQLClient,
            knowledgeBaseId: kb.id,
            vectorLength: kb.vectorLength,
            extendColumns,
            filter,
            minimumScore: 0.5,
            includeInternalMetadata: true,
          }),
          indexName: getKnowledgeBaseGraphIndexName(kb.id, kb.vectorLength),
          model,
          includeSources: true,
          graphOptions: {
            dimension: kb.vectorLength,
          },
        });
        const graphResult = await graphTool.execute(
          { queryText: embeddingQuery, topK: candidateLimit },
          {
            mastra: {
              getLogger: () => ({
                debug: () => undefined,
                error: (message: string, details?: Record<string, unknown>) =>
                  console.error(
                    `[knowledge-base] ${message}`,
                    details?.error ?? details,
                  ),
              }),
            },
          } as any,
        );
        for (const source of graphResult?.sources ?? []) {
          const metadata = source?.metadata as Record<string, any> | undefined;
          const internal = metadata?.['__knowledgeBase'] as
            | {
              metadata?: Record<string, unknown>;
              type?: string;
              extendValues?: Record<string, unknown>;
              vectorScore?: number;
            }
            | undefined;
          const chunkId = metadata?.chunkId;
          const itemId = metadata?.itemId;
          if (chunkId && itemId && internal) {
            vectorRows.push({
              id: String(chunkId),
              item_id: String(itemId),
              chunk: source.document ?? metadata?.text ?? '',
              score: Number(internal.vectorScore ?? source.score ?? 0),
              graphScore: Number(source.score ?? 0),
              metadata: JSON.stringify(internal.metadata ?? {}),
              type: internal.type ?? 'text',
              ...(internal.extendValues ?? {}),
            });
          }
        }
        semanticSearchAvailable = vectorRows.length > 0;
      } catch (error) {
        console.error(
          `[knowledge-base] GraphRAG search with ${kb.embedding} failed, falling back to BM25`,
          error,
        );
        vectorRows.length = 0;
      }
    } else if (kb.embedding && fileTpye === 'image') {
      try {
        const embeddings = await this.calcEmbeddings(
          kb.embedding,
          [],
          [originalQuery],
        );
        const candidateVector = embeddings?.image_embeddings?.[0];
        if (
          candidateVector?.length &&
          candidateVector.every(Number.isFinite) &&
          (!kb.vectorLength || candidateVector.length === kb.vectorLength)
        ) {
          vectorStr = candidateVector;
        } else {
          console.warn(
            `[knowledge-base] embedding model ${kb.embedding} is unavailable, falling back to BM25`,
          );
        }

        if (vectorStr) {
          const vectorResults = await this.libSQLClient.execute({
            sql: `
          WITH vector_scores AS (
            SELECT
              id,
              item_id,
              chunk,
              (1-vector_distance_cos(embedding, vector32(?))) as score,
              metadata,
              "type"
              ${extendSelect}
            FROM [kb_${kb.id}_${kb.vectorLength ?? 0}]
            WHERE is_enable = 1${filterCondition}
          )
          SELECT *
          FROM vector_scores
          WHERE score > ? AND type = 'text'
          ORDER BY score DESC
          LIMIT ?`,
            args: [JSON.stringify(vectorStr), 0.5, candidateLimit],
          });
          vectorRows.push(
            ...vectorResults.rows.map((row) => ({
              ...row,
              id: String(row.id),
              score: Number(row.score),
            })),
          );
          semanticSearchAvailable = true;
        }
      } catch (error) {
        console.error(
          `[knowledge-base] vector search with ${kb.embedding} failed, falling back to BM25`,
          error,
        );
        vectorStr = undefined;
        vectorRows.length = 0;
      }
    }

    if (vectorStr && kb.embedding && this.isLocalClipModel(kb.embedding)) {
      try {
        const imageResults = await this.libSQLClient.execute({
          sql: `
        WITH vector_scores AS (
          SELECT
            id,
            item_id,
            chunk,
            (1-vector_distance_cos(embedding, vector32(?))) as score,
            metadata,
            "type",
            vector_extract(embedding) as embedding
            ${extendSelect}
          FROM [kb_${kb.id}_${kb.vectorLength ?? 0}]
          WHERE is_enable = 1${filterCondition}
        )
        SELECT *
        FROM vector_scores
        WHERE type = 'image'
        ORDER BY score DESC
        LIMIT ?`,
          args: [JSON.stringify(vectorStr), candidateLimit],
        });
        for (const row of imageResults.rows) {
          const score = await this.calcClipCosineSimilarity(
            kb.embedding,
            vectorStr,
            JSON.parse(row.embedding as string),
          );
          if (fileTpye === 'text' || score > 0.7) {
            vectorRows.push({
              ...row,
              id: String(row.id),
              score,
            });
          }
        }
      } catch (error) {
        console.error('[knowledge-base] image vector search failed', error);
        if (fileTpye === 'image') {
          vectorStr = undefined;
          vectorRows.length = 0;
          semanticSearchAvailable = false;
        }
      }
      semanticSearchAvailable =
        semanticSearchAvailable || vectorRows.length > 0;
    }

    if (fileTpye === 'image' && !semanticSearchAvailable) {
      return {
        query: originalQuery,
        embedding: kb.embedding ?? '',
        searchType: 'bm25',
        knowledgeBaseId: kb.id,
        forceReturnFullContent: kb.forceReturnFullContent,
        results: [],
      };
    }
    const bm25Rows: any[] = [];
    if (fileTpye === 'text') {
      const matchQuery = buildMatchQuery(originalQuery);
      if (matchQuery) {
        const ftsTable = getFtsTableName(kb.id);
        const bm25Results = await this.libSQLClient.execute({
          sql: `SELECT
              chunks.id,
              chunks.item_id,
              chunks.chunk,
              chunks.metadata,
              chunks."type",
              bm25([${ftsTable}]) AS bm25_rank
              ${extendSelect}
            FROM [${ftsTable}]
            JOIN [kb_${kb.id}_${kb.vectorLength ?? 0}] AS chunks
              ON chunks.id = [${ftsTable}].chunk_id
            WHERE [${ftsTable}] MATCH ?
              AND chunks.is_enable = 1
              AND chunks."type" = 'text'${filterCondition}
            ORDER BY bm25_rank ASC
            LIMIT ?`,
          args: [matchQuery, candidateLimit],
        });
        bm25Rows.push(
          ...bm25Results.rows.map((row, index) => ({
            ...row,
            id: String(row.id),
            bm25Score: 1 / (index + 1),
          })),
        );
      }
    }

    const getBm25ResultRows = () =>
      rrfFuse([bm25Rows])
        .map((row) => ({
          ...row,
          score: row.rrfScore,
          hybridScore: row.rrfScore,
        }))
        .slice(0, top_k);

    let searchType: SearchKnowledgeBaseResult['searchType'];
    let resultRows: any[];
    if (semanticSearchAvailable && fileTpye === 'text') {
      searchType = 'hybrid';
      resultRows = rrfFuse([vectorRows, bm25Rows])
        .map((row) => ({ ...row, hybridScore: row.rrfScore }))
        .slice(0, top_k);
    } else if (semanticSearchAvailable) {
      searchType = 'vector';
      resultRows = vectorRows
        .map((row) => ({ ...row, hybridScore: row.score }))
        .slice(0, top_k);
    } else {
      searchType = 'bm25';
      resultRows = getBm25ResultRows();
    }

    const hydrateResults = async (
      rows: any[],
    ): Promise<SearchKnowledgeBaseItemResult[]> => {
      const itemIds = [...new Set(rows.map((row) => String(row.item_id)))];
      if (itemIds.length === 0) return [];
      const items = await this.knowledgeBaseItemRepository.find({
        where: {
          id: In(itemIds),
        },
      });

      return rows.flatMap((item) => {
        const kbitem = items.find((x) => x.id === item.item_id);
        if (!kbitem) return [];
        const extendValues = {};
        if (vectorStoreConfig?.extendColumns?.length > 0) {
          for (const x of vectorStoreConfig.extendColumns) {
            extendValues[x.name] = item[x.name];
          }
        }
        return [{
          id: item.id as string,
          itemId: item.item_id as string,
          score: Number(item.score ?? item.bm25Score ?? 0),
          bm25Score: item.bm25Score as number | undefined,
          graphScore: item.graphScore as number | undefined,
          hybridScore: Number(item.hybridScore ?? item.score ?? item.bm25Score ?? 0),
          metadata: { ...(JSON.parse(item?.metadata as string ?? '{}')), ...(kbitem.metadata ?? {}) },
          chunk: item.chunk as string,
          type: item.type as 'text' | 'image',
          name: kbitem.name,
          source: kbitem.source,
          sourceType: kbitem.sourceType as KnowledgeBaseSourceType,
          content: kbitem.content,
          extendValues,
        }];
      });
    };

    let _results = await hydrateResults(resultRows);

    if (kb.reranker && originalQuery && _results.length > 0) {
      try {
        const model = await providersManager.getRerankModel(kb.reranker);
        const rereankResults = await model.doRerank({
          query: originalQuery,
          documents: _results.map(x => x.chunk ?? ''),
          options: {
            top_k: top_k,
          },
        });
        rereankResults.forEach(result => {
          const item = _results[result.index];
          if (item) {
            item.rerankScore = result.score;
            item.hybridScore = ((item.hybridScore ?? item.score) + result.score) / 2;
          }
        });
      } catch (error) {
        console.error(
          `[knowledge-base] reranker model ${kb.reranker} failed, falling back to BM25`,
          error,
        );
        if (fileTpye === 'text') {
          searchType = 'bm25';
          resultRows = getBm25ResultRows();
          _results = await hydrateResults(resultRows);
        }
      }
    }

    _results = _results
      .sort(
        (a, b) =>
          (b.hybridScore ?? b.score) - (a.hybridScore ?? a.score),
      )
      .slice(0, top_k);
    return {
      query: originalQuery,
      embedding: kb.embedding ?? '',
      searchType,
      knowledgeBaseId: kb.id,
      forceReturnFullContent: kb.forceReturnFullContent,
      results: _results,
    }
  }
  @channel(KnowledgeBaseChannel.UpdateKnowledgeBaseItem)
  public async updateKnowledgeBaseItem(
    id: string,
    data: {
      name?: string;
      content?: string;
      source?: any;
      metadata?: any;
    },
  ): Promise<KnowledgeBaseItem> {
    let item = await this.knowledgeBaseItemRepository.findOne({
      where: { id },
      relations: ['knowledgeBase'],
    });
    if (!item) {
      throw new Error('Knowledge base item not found');
    }
    const kb = item.knowledgeBase;
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    this.assertKnowledgeBaseNotReembedding(kb.id);

    const nextName =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? data.name.trim()
        : item.name;
    const contentChanged =
      typeof data.content === 'string' && data.content !== (item.content ?? '');
    const nextContent = contentChanged ? data.content : item.content;

    item.name = nextName;
    if (typeof data.metadata !== 'undefined') {
      item.metadata = { ...(item.metadata ?? {}), ...(data.metadata ?? {}) };
    }
    if (typeof data.source !== 'undefined') {
      item.source = data.source;
    } else if (
      contentChanged &&
      item.sourceType === KnowledgeBaseSourceType.Text &&
      item.source &&
      typeof item.source === 'object'
    ) {
      item.source = { ...item.source, content: nextContent };
    }

    if (contentChanged) {
      item.content = nextContent;
      item.state = KnowledgeBaseItemState.Processing;
      item.error = undefined;
      item = await this.knowledgeBaseItemRepository.save(item);
      await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
        kbId: kb.id,
        items: [item],
      });

      try {
        await this.deleteChunkRows(kb, item.id, true);

        let chunkCount = 0;
        if (nextContent && nextContent.trim().length > 0) {
          const doc = MDocument.fromText(nextContent);
          const chunks = await doc.chunk({
            strategy: 'recursive',
            maxSize: 512,
            overlap: 50,
            separators: ['\n'],
          });
          if (chunks.length > 0) {
            const embeddings = kb.embedding
              ? (
                await this.calcEmbeddings(
                  kb.embedding,
                  chunks.map((chunk) => chunk.text),
                )
              )?.text_embeddings
              : undefined;
            const extendColumns = (kb.vectorStoreConfig?.extendColumns ?? [])
              .map((column) => ({
                column: column.name,
                value: (item.extendData ?? {})[column.name] ?? null,
              }));
            await this.insertChunkRows(
              kb,
              item.id,
              chunks,
              embeddings,
              extendColumns,
            );
            chunkCount = chunks.length;
          }
        }

        item.chunkCount = chunkCount;
        item.state = KnowledgeBaseItemState.Completed;
        item.isEnable = true;
        item.updatedAt = new Date();
        item = await this.knowledgeBaseItemRepository.save(item);
      } catch (error) {
        item.state = KnowledgeBaseItemState.Fail;
        item.error = error instanceof Error ? error.message : String(error);
        item = await this.knowledgeBaseItemRepository.save(item);
        await appManager.sendEvent(
          KnowledgeBaseEvent.KnowledgeBaseItemsUpdated,
          {
            kbId: kb.id,
            items: [item],
          },
        );
        throw error;
      }
    } else {
      item.updatedAt = new Date();
      item = await this.knowledgeBaseItemRepository.save(item);
    }

    await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
      kbId: kb.id,
      items: [item],
    });
    return item;
  }

  @channel(KnowledgeBaseChannel.DeleteKnowledgeBaseItem)
  public async deleteKnowledgeBaseItem(id: string) {
    const item = await this.knowledgeBaseItemRepository.findOne({ where: { id }, relations: ['knowledgeBase'] });
    if (!item) {
      throw new Error('Knowledge base item not found');
    }
    this.assertKnowledgeBaseNotReembedding(item.knowledgeBaseId);
    await this.deleteChunkRows(item.knowledgeBase, item.id);
    await this.knowledgeBaseItemRepository.delete(id);
  }
  @channel(KnowledgeBaseChannel.ImportSource)
  public async importSource(data: {
    kbId: string;
    source: any;
    type: KnowledgeBaseSourceType;
    extendColumns?: { column: string, value: any }[];
  }) {
    const { kbId, source, type, extendColumns = [] } = data;
    const kb = await this.knowledgeBaseRepository.findOneBy({ id: kbId });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }



    // 输入校验
    this.assertKnowledgeBaseNotReembedding(kbId);

    let taskName = '';
    if (type == KnowledgeBaseSourceType.Web && isUrl(source.url)) {
      taskName = `导入网页: ${source.url}`;
    } else if (
      type == KnowledgeBaseSourceType.File &&
      Array.isArray(source.files) &&
      source.files.length > 0
    ) {
      taskName = `导入文件: ${source.files.map(x => x.split(/[\\/]/).pop() || x).join(', ')}`;
    } else if (
      type == KnowledgeBaseSourceType.Folder &&
      fs.existsSync(source) &&
      fs.statSync(source).isDirectory()
    ) {
      taskName = `导入文件夹: ${source.split(/[\\/]/).pop() || source}`;
    } else if (
      type == KnowledgeBaseSourceType.Text &&
      (source as any)?.content?.trim()
    ) {
      const content = (source as any).content.trim();
      taskName = `导入文本: ${content.substring(0, 20)}`;
    } else {
      throw new Error('Invalid source');
    }

    // 加入后台任务队列，同一个知识库的导入串行执行(maxConcurrency=1)
    const taskId = await taskQueueManager.addTask({
      groupId: `kb-import-${kbId}`,
      type: 'kb-import',
      name: taskName,
      data: { kbId, source, type, kbName: kb.name, extendColumns: extendColumns },
      groupMaxConcurrency: 1,
    });

    return taskId;
  }

  /**
   * 后台任务执行体：实际的知识库导入逻辑
   */
  private async executeImportSource(
    task: BackgroundTask,
    ctx: TaskContext,
  ): Promise<void> {
    const { kbId, source, type, extendColumns = [] } = task.data as {
      kbId: string;
      source: any;
      type: KnowledgeBaseSourceType;
      extendColumns: { column: string, value: any }[];
    };

    const kb = await this.knowledgeBaseRepository.findOneBy({ id: kbId });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    ctx.updateProgress(10, '准备导入...');
    if (type == KnowledgeBaseSourceType.Text && source?.content?.trim()) {
      await ctx.waitIfPaused();
      if (ctx.isCancelled()) return;
      let item = new KnowledgeBaseItem(nanoid(), kbId, undefined, type);
      item.source = source;
      item.isEnable = false;
      item.state = KnowledgeBaseItemState.Pending;

      const content = source.content.trim();
      item.name = source.name ?? content.substring(0, 10);
      item.content = content;
      if (source.role) {
        item.metadata = { ...(item.metadata ?? {}), role: source.role };
      }
      if (extendColumns && extendColumns.length > 0) {
        item.extendData = Object.fromEntries(extendColumns.map(x => [x.column, x.value]));
      }


      ctx.updateProgress(50, '保存数据...');
      item = await this.knowledgeBaseItemRepository.save(item);
      await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
        kbId: kbId,
        items: [item]
      });
      try {
        const doc = MDocument.fromText(content);
        const chunks = await doc.chunk({
          strategy: "markdown",
          maxSize: 512,
          overlap: 50,
        });
        console.log(source);
        const embeddings = kb.embedding
          ? (
            await this.calcEmbeddings(
              kb.embedding,
              chunks.map((chunk) => chunk.text),
            )
          )?.text_embeddings
          : undefined;
        await this.insertChunkRows(
          kb,
          item.id,
          chunks,
          embeddings,
          extendColumns,
        );
        item.chunkCount = chunks.length;
        item.state = KnowledgeBaseItemState.Completed;
        item.isEnable = true;
        // item.sha256 = crypto.createHash('sha256').update(content).digest('hex');
        item.updatedAt = new Date();
        item = await this.knowledgeBaseItemRepository.save(item);
        await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
          kbId: kbId,
          items: [item]
        });
      } catch (error) {
        item.state = KnowledgeBaseItemState.Fail;
        item.error = error.message;
        item = await this.knowledgeBaseItemRepository.save(item);
        await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
          kbId: kbId,
          items: [item]
        });
      }

      ctx.updateProgress(100, '导入完成');
    } else if (type == KnowledgeBaseSourceType.Web && isUrl(source.url)) {
      await ctx.waitIfPaused();
      if (ctx.isCancelled()) return;
      let item = new KnowledgeBaseItem(nanoid(), kbId, undefined, type);
      item.source = source;
      item.isEnable = false;
      item.state = KnowledgeBaseItemState.Pending;
      const webFetch = await toolsManager.buildTool(`${ToolType.BUILD_IN}:${WebFetch.toolName}`);

      const content = await (webFetch as WebFetch).execute({
        url: source.url,
        // prompt: '请将网页内容转换为markdown格式'
      });
      item.name = content.substring(0, 10);
      item.content = content;
      if (extendColumns && extendColumns.length > 0) {
        item.extendData = Object.fromEntries(extendColumns.map(x => [x.column, x.value]));
      }
      item = await this.knowledgeBaseItemRepository.save(item);
      await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
        kbId: kbId,
        items: [item]
      });
      try {

        const doc = MDocument.fromText(content);
        const chunks = await doc.chunk({
          strategy: "recursive",
          maxSize: 512,
          overlap: 50,
          separators: ["\n"],
          extract: {
            metadata: true,
          } as any,
        });

        const embeddings = kb.embedding
          ? (
            await this.calcEmbeddings(
              kb.embedding,
              chunks.map((chunk) => chunk.text),
            )
          )?.text_embeddings
          : undefined;
        await this.insertChunkRows(
          kb,
          item.id,
          chunks,
          embeddings,
          extendColumns,
        );
        item.chunkCount = chunks.length;
        item.state = KnowledgeBaseItemState.Completed;
        item.isEnable = true;
        // item.sha256 = crypto.createHash('sha256').update(content).digest('hex');
        item.updatedAt = new Date();
        item = await this.knowledgeBaseItemRepository.save(item);

        await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
          kbId: kbId,
          items: [item]
        });
      } catch (error) {
        item.state = KnowledgeBaseItemState.Fail;
        item.error = error.message;
        item = await this.knowledgeBaseItemRepository.save(item);
        await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
          kbId: kbId,
          items: [item]
        });
      }

      ctx.updateProgress(100, '导入完成');
    } else if (
      type == KnowledgeBaseSourceType.File &&
      Array.isArray(source.files) &&
      source.files.length > 0
    ) {


      const items: KnowledgeBaseItem[] = [];
      for (const file of source.files) {
        const item = new KnowledgeBaseItem(nanoid(), kbId, undefined, type);
        item.name = path.basename(file);
        item.source = file;
        item.isEnable = false;
        item.state = KnowledgeBaseItemState.Pending;
        if (extendColumns && extendColumns.length > 0) {
          item.extendData = Object.fromEntries(extendColumns.map(x => [x.column, x.value]));
        }
        items.push(await this.knowledgeBaseItemRepository.save(item));
      }
      await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
        kbId: kbId,
        items: items
      });



      for (const [index, _item] of items.entries()) {
        await ctx.waitIfPaused();
        if (ctx.isCancelled()) return;
        let item = await this.knowledgeBaseItemRepository.findOneBy({ id: _item.id });

        try {
          const file = _item.source as string;
          let content = '';
          item.state = KnowledgeBaseItemState.Processing;
          item = await this.knowledgeBaseItemRepository.save(item);
          await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
            kbId: kbId,
            items: [item]
          });
          const ext = path.extname(file).toLowerCase();
          const isImage = mime.lookup(file).startsWith('image/')

          if (await isBinaryFile(file) && ext != '.ts') {
            try {
              content = await new ReadBinaryFile({
                forcePDFOcr: true,
                forceWordOcr: false,
                reminder: false,
                excludeInsideImage: true,
              }).execute({
                file_source: file,
                args: {}
              }, {} as any);
            }
            catch (err) {
              console.error(err);
            }

          } else {
            content = await fs.promises.readFile(file, 'utf-8');
          }
          if (!isImage && !content.trim()) {
            throw new Error('File content is failed to extract');
          }
          item.content = content;
          const buffer = await fs.promises.readFile(file);
          console.log(file, content)
          item = await this.knowledgeBaseItemRepository.save(item);
          await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
            kbId: kbId,
            items: [item]
          });
          let chunks = [];
          if (content) {
            const doc = MDocument.fromText(content);
            chunks = await doc.chunk({
              strategy: "recursive",
              maxSize: 512,
              overlap: 50,
              separators: ["\n"],
            });
            item.chunkCount = chunks.length;
          }

          let embeddings: { text_embeddings: number[][], image_embeddings?: number[][] } | undefined;
          if (kb.embedding) {
            if (isImage) {
              embeddings = await this.calcEmbeddings(
                kb.embedding,
                chunks.map((chunk) => chunk.text),
                [file],
              );
            } else {
              embeddings = await this.calcEmbeddings(
                kb.embedding,
                chunks.map((chunk) => chunk.text),
              );
            }
          }
          const insertStatements = [];
          const hasImage = embeddings?.image_embeddings?.[0] !== undefined;

          if (chunks.length > 0) {
            await this.insertChunkRows(
              kb,
              item.id,
              chunks,
              embeddings?.text_embeddings,
              extendColumns,
            );
          }

          if (hasImage) {
            // item.content = buffer.toString('base64');
            item.metadata = {
              ...(item.metadata ?? {}),
              mimeType: mime.lookup(file),
              embeddingType: 'image',
              base64: buffer.toString('base64'),
            };
            item = await this.knowledgeBaseItemRepository.save(item);
            insertStatements.push({
              sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength ?? 0}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `"${x.column}"`).join(', ') : ''})
              VALUES (?, ?, ?, ?, ?, vector32(?), ? ${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `?`).join(', ') : ''})`,
              args: [
                nanoid(),
                item.id,
                null,
                true,
                'image',
                JSON.stringify(embeddings?.image_embeddings?.[0]),
                JSON.stringify({
                  mimeType: mime.lookup(file),
                }),
                ...extendColumns.map(x => x.value),
              ],
            });
          }





          if (insertStatements.length > 0) {
            await this.libSQLClient.batch(insertStatements);
          }

          item.state = KnowledgeBaseItemState.Completed;
          item.isEnable = true;
          // item.sha256 = crypto.createHash('sha256').update(content).digest('hex');
          item.updatedAt = new Date();
          item = await this.knowledgeBaseItemRepository.save(item);
          await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
            kbId: kbId,
            items: [item]
          });

        } catch (error) {

          item.state = KnowledgeBaseItemState.Fail;
          item.error = error.message;
          item = await this.knowledgeBaseItemRepository.save(item);
          await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
            kbId: kbId,
            items: [item]
          });

        }

        ctx.updateProgress(100 * (index + 1) / source.files.length, `导入完成: ${path.basename(_item.source)}`);
      }
      ctx.updateProgress(100, '导入完成');
    } else if (
      type == KnowledgeBaseSourceType.Folder &&
      fs.existsSync(source) &&
      fs.statSync(source).isDirectory()
    ) {
      await ctx.waitIfPaused();
      if (ctx.isCancelled()) return;
      // TODO: 文件夹导入逻辑
      ctx.updateProgress(100, '导入完成');
    }
  }

  public async delectSource(kbId: string, source: string) { }
}

export const knowledgeBaseManager = new KnowledgeBaseManager();
export default knowledgeBaseManager;
