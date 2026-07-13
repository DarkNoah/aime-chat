import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { KnowledgeBaseChannel } from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  KnowledgeBaseEvent,
  KnowledgeBaseItemState,
  KnowledgeBaseSQLiteImportMode,
  KnowledgeBaseSQLiteInfo,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseItemResult,
  SearchKnowledgeBaseResult,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import { In, Repository } from 'typeorm';
import { Client as LibSQLClient } from '@libsql/client';
import { MDocument } from "@mastra/rag";
import { nanoid } from '@/utils/nanoid';
import { providersManager } from '../providers';
import { isUrl } from '@/utils/is';
import fs from 'fs';
import { taskQueueManager, TaskContext } from '../task-queue';
import { BackgroundTask } from '@/types/task-queue';
import { WebFetch } from '../tools/web/web-fetch';
import { getAssetPath, getDbPath } from '../utils';
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
import { importBundledKnowledgeBases } from './bundled-import';
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

type KnowledgeBaseChunk = {
  text: string;
  metadata?: Record<string, unknown>;
};

type ExtendColumnValue = {
  column: string;
  value: any;
};

export class KnowledgeBaseManager extends BaseManager {
  knowledgeBaseRepository: Repository<KnowledgeBase>;
  knowledgeBaseItemRepository: Repository<KnowledgeBaseItem>;
  libSQLClient: LibSQLClient;
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

    importBundledKnowledgeBases(getAssetPath('market', 'knowledge-base')).catch(
      (err) =>
        console.error('[knowledge-base] import bundled knowledge bases failed', err),
    );

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
      const res2 = await embeddingModel.doEmbed({ values: texts });
      return { text_embeddings: res2.embeddings, image_embeddings: undefined };
    } catch (err) {
      console.error(err);
    }
    return undefined
  }

  async calcClipCosineSimilarity(modeId: string, embedding1: number[], embedding2: number[]): Promise<number> {
    const appInfo = await appManager.getInfo();
    const modelPath = path.join(appInfo.modelPath, 'clip', modeId);
    const model = new LocalCLIPModel(modeId, modelPath);
    return model.cosineSimilarity(new Float32Array(embedding1), new Float32Array(embedding2));
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
        throw new Error('Embedding length is 0');
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
  public async updateKnowledgeBase(id: string, data: UpdateKnowledgeBase) {
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    await this.knowledgeBaseRepository.update(id, data);
  }

  @channel(KnowledgeBaseChannel.Delete)
  public async deleteKnowledgeBase(id: string) {
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
    const filterCondition =
      vectorStoreConfig?.extendColumns?.length > 0 && filter
        ? ` AND (${filter})`
        : '';
    let vectorStr: number[] | undefined;
    if (kb.embedding) {
      let embeddingQuery = originalQuery;
      if (
        fileTpye === 'text' &&
        kb.embedding.split('/').at(-1) === 'jina-clip-v2'
      ) {
        embeddingQuery =
          'Represent the query for retrieving evidence documents: ' +
          originalQuery;
      }
      const embeddings =
        fileTpye === 'text'
          ? await this.calcEmbeddings(kb.embedding, [embeddingQuery])
          : await this.calcEmbeddings(kb.embedding, [], [originalQuery]);
      vectorStr =
        embeddings?.text_embeddings?.[0] ??
        embeddings?.image_embeddings?.[0];
    }

    if (fileTpye === 'image' && !vectorStr) {
      return {
        query: originalQuery,
        embedding: kb.embedding ?? '',
        searchType: 'bm25',
        results: [],
      };
    }

    const vectorRows: any[] = [];
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
    }

    if (vectorStr && kb.embedding && this.isLocalClipModel(kb.embedding)) {
      const image_results = await this.libSQLClient.execute({
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
      for (const row of image_results.rows) {
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

    let searchType: SearchKnowledgeBaseResult['searchType'];
    let resultRows: any[];
    if (vectorStr && fileTpye === 'text') {
      searchType = 'hybrid';
      resultRows = rrfFuse([vectorRows, bm25Rows])
        .map((row) => ({ ...row, hybridScore: row.rrfScore }))
        .slice(0, top_k);
    } else if (vectorStr) {
      searchType = 'vector';
      resultRows = vectorRows
        .map((row) => ({ ...row, hybridScore: row.score }))
        .slice(0, top_k);
    } else {
      searchType = 'bm25';
      resultRows = rrfFuse([bm25Rows])
        .map((row) => ({
          ...row,
          score: row.rrfScore,
          hybridScore: row.rrfScore,
        }))
        .slice(0, top_k);
    }

    const itemIds = [...new Set(resultRows.map((row) => String(row.item_id)))];
    const items = await this.knowledgeBaseItemRepository.find({
      where: {
        id: In(itemIds),
      },
    });
    if (items.length == 0) {
      return {
        query: originalQuery,
        embedding: kb.embedding ?? '',
        searchType,
        results: [],
      }
    }

    let _results: SearchKnowledgeBaseItemResult[] = resultRows.map(item => {
      const kbitem = items.find(x => x.id === item.item_id)
      const extendValues = {};
      if (vectorStoreConfig?.extendColumns?.length > 0) {
        for (const x of vectorStoreConfig?.extendColumns ?? []) {
          extendValues[x.name] = item[x.name];
        }
      }
      return {
        id: item.id as string,
        itemId: item.item_id as string,
        score: Number(item.score ?? item.bm25Score ?? 0),
        bm25Score: item.bm25Score as number | undefined,
        hybridScore: Number(item.hybridScore ?? item.score ?? item.bm25Score ?? 0),
        metadata: { ...(JSON.parse(item?.metadata as string ?? '{}')), ...(kbitem?.metadata ?? {}) },
        chunk: item.chunk as string,
        type: item.type as 'text' | 'image',
        name: kbitem.name,
        source: kbitem.source,
        sourceType: kbitem.sourceType as KnowledgeBaseSourceType,
        content: kbitem.content,
        extendValues: extendValues
      }
    });

    if (kb.reranker && originalQuery && _results.length > 0) {
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
            await this.insertChunkRows(kb, item.id, chunks, embeddings);
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
          },
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
              }, {});
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
