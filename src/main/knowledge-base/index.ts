import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { KnowledgeBaseChannel } from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  KnowledgeBaseEvent,
  KnowledgeBaseItemState,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseItemResult,
  SearchKnowledgeBaseResult,
  UpdateKnowledgeBase,
  VectorStoreType,
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
import { embedMany } from 'ai';
import { LibSQLVector } from '@mastra/libsql';
import { getDbPath } from '../utils';
import { PaginationInfo, PaginationParams } from '@/types/common';
import path from 'path';
import { isBinaryFile } from 'isbinaryfile';
import { ReadBinaryFile } from '../tools/file-system/read';
import { appManager } from '../app';
import { toolsManager } from '../tools';
import { ToolType } from '@/types/tool';
import localModels from '../local-model/models.json';
import { LocalClipModel } from '../providers/local-provider';
import mime from 'mime';
import { LocalCLIPModel } from '../local-model/clip';
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
    return modelId.startsWith('local/');
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








  @channel(KnowledgeBaseChannel.Create)
  public async createKnowledgeBase(data: CreateKnowledgeBase & { id?: string; static?: boolean }): Promise<KnowledgeBase> {
    const kbId = data.id ?? nanoid();
    if (!data.embedding) {
      throw new Error('Embedding Model is required');
    }
    const { text_embeddings: embeddings } = await this.calcEmbeddings(data.embedding, ['Hello']);
    let embedding_length = embeddings?.length != 1 ? undefined : embeddings[0].length;


    if (!embedding_length || embedding_length == 0) {
      throw new Error('Embedding length is 0');
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

    const res = await this.libSQLClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS [kb_${kbId}_${embedding_length}] (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      chunk TEXT NULL,
      is_enable BOOLEAN,
      type TEXT NULL,
      [embedding] F32_BLOB(${embedding_length}) NULL,
      [metadata] TEXT NULL DEFAULT '{}'
      ${extendColumns.length > 0 ? `, ${extendColumns.join(',\n')}` : ''}

      )`,
      args: [],
    });

    return await this.knowledgeBaseRepository.save({
      ...data,
      id: kbId,
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
    const res = await this.libSQLClient.execute({
      sql: `DROP TABLE IF EXISTS [kb_${id}_${kb.vectorLength}]`,
      args: [],
    });
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
    const store = await this.getVectorStore(kb.id);
    // let embeddings;
    // if (this.isLocalModel(kb.embedding)) {
    //   const modelId = kb.embedding.split('/').slice(1).join('/')
    //   if (!this.isLocalClipModel(kb.embedding)) {
    //     const embeddingModel = await providersManager.getEmbeddingModel(
    //       kb.embedding,
    //     );
    //     const res2 = await embeddingModel.doEmbed({ values: [query] });
    //     embeddings = res2.embeddings[0];
    //   } else {
    //     const model = new LocalClipModel(modelId);
    //     const res2 = await model.doClip({ contents: [query], images: [] });
    //     embeddings = res2.text_embeddings[0];
    //   }
    // } else {
    //   const result = await embedMany({
    //     model: await providersManager.getEmbeddingModel(kb.embedding),
    //     values: [query],
    //   });
    //   embeddings = result.embeddings;
    // }

    let embeddings: {
      text_embeddings: number[][];
      image_embeddings?: number[][];
    }
    if (fileTpye == 'text') {
      if (kb.embedding.split('/')[kb.embedding.split('/').length - 1] == 'jina-clip-v2') {
        const QUERY_PREFIX = 'Represent the query for retrieving evidence documents: ';
        query = QUERY_PREFIX + query;
      }
      embeddings = await this.calcEmbeddings(kb.embedding, [query]);
    } else if (fileTpye == 'image') {
      embeddings = await this.calcEmbeddings(kb.embedding, [], [query]);
    }

    const { vectorStoreConfig } = kb;


    const vectorStr = embeddings?.text_embeddings?.[0] || embeddings?.image_embeddings?.[0];
    const results = await this.libSQLClient.execute({
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
          ${vectorStoreConfig?.extendColumns?.length > 0 ? "," + vectorStoreConfig?.extendColumns?.map(x => `"${x.name}"`).join(',\n') : ''}
        FROM [kb_${kb.id}_${kb.vectorLength}]
        WHERE is_enable = 1 ${vectorStoreConfig?.extendColumns?.length > 0 && filter ? 'AND (' + filter + ')' : ''}
      )
      SELECT *
      FROM vector_scores
      WHERE score > ? and type = 'text'
      ORDER BY score DESC
      LIMIT ?`,
      args: [JSON.stringify(vectorStr), 0.5, top_k],
    });

    if (this.isLocalClipModel(kb.embedding)) {
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
            ${vectorStoreConfig?.extendColumns?.length > 0 ? "," + vectorStoreConfig?.extendColumns?.map(x => `"${x.name}"`).join(',\n') : ''}
          FROM [kb_${kb.id}_${kb.vectorLength}]
          WHERE is_enable = 1 ${vectorStoreConfig?.extendColumns?.length > 0 && filter ? 'AND (' + filter + ')' : ''}
        )
        SELECT *
        FROM vector_scores
        WHERE type = 'image'
        ORDER BY score DESC
        LIMIT ?`,
        args: [JSON.stringify(vectorStr), top_k],
      });
      if (image_results.rows.length > 0) {

        for (const row of image_results.rows) {
          const score = await this.calcClipCosineSimilarity(kb.embedding, vectorStr, JSON.parse(row.embedding as string));
          row.score = score;
          console.log(row, score);
          if (fileTpye == 'text') {
            results.rows.push({
              ...row,
              score: score,
            });
          }
          else if (score > 0.7) {
            results.rows.push({
              ...row,
              score: score,
            });
          }
        }

      }
    }








    const itemIds = [...new Set(results.rows.map(x => x.item_id))];
    const items = await this.knowledgeBaseItemRepository.find({
      where: {
        id: In(itemIds),
      },
    });
    if (items.length == 0) {
      return {
        query: query,
        embedding: kb.embedding,
        results: [],
      }
    }

    const _results: SearchKnowledgeBaseItemResult[] = results.rows.map(item => {
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
        score: item.score as number,
        hybridScore: item.hybrid_score as number ?? item.score as number,
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

    if (kb.reranker && query) {
      const model = await providersManager.getRerankModel(kb.reranker);
      const rereankResults = await model.doRerank({
        query: query,
        documents: results.rows.map(x => x.chunk as string),
        options: {
          top_k: top_k,
        },
      });
      rereankResults.forEach(result => {
        const item = _results[result.index];
        if (item) {
          item.rerankScore = result.score;
          item.hybridScore = (item.score + result.score) / 2;
        }
      });
    }


    return {
      query: query,
      embedding: kb.embedding,
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
        await this.libSQLClient.execute({
          sql: `DELETE FROM [kb_${kb.id}_${kb.vectorLength}] WHERE item_id = ? AND ("type" IS NULL OR "type" = 'text')`,
          args: [item.id],
        });

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
            const { text_embeddings: embeddings } = await this.calcEmbeddings(
              kb.embedding,
              chunks.map((chunk) => chunk.text),
            );
            const insertStatements = chunks.map((chunk, index) => ({
              sql: `INSERT INTO [kb_${kb.id}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata)
              VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
              args: [
                nanoid(),
                item.id,
                chunk.text,
                true,
                'text',
                JSON.stringify(embeddings[index]),
                JSON.stringify(chunk.metadata ?? {}),
              ],
            }));
            await this.libSQLClient.batch(insertStatements);
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
    const res = await this.libSQLClient.execute({
      sql: `DELETE FROM [kb_${item.knowledgeBaseId}_${item.knowledgeBase.vectorLength}] WHERE item_id = ?`,
      args: [item.id],
    });
    await this.knowledgeBaseItemRepository.delete(id);
  }





  private async getVectorStore(kbId: string) {
    const kb = await this.knowledgeBaseRepository.findOneBy({ id: kbId });
    if (!kb) {
      throw new Error('Knowledge base not found');
    }
    if (kb.vectorStoreType == VectorStoreType.LibSQL) {
      return new LibSQLVector({
        id: `kb_${kb.id}_${kb.vectorLength}`,
        url: `file:${getDbPath()}`,
      });
    }
    throw new Error('Vector store type not supported');
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
      fs.existsSync(data.source) &&
      fs.statSync(data.source).isDirectory()
    ) {
      taskName = `导入文件夹: ${data.source.split(/[\\/]/).pop() || data.source}`;
    } else if (
      type == KnowledgeBaseSourceType.Text &&
      (data.source as any)?.content?.trim()
    ) {
      const content = (data.source as any).content.trim();
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
    const store = await this.getVectorStore(kbId);



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
        const { text_embeddings: embeddings } = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text));

        const insertStatements = chunks.map((chunk, index) => {
          const embedding = embeddings[index];
          return {
            sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `"${x.column}"`).join(', ') : ''})
        VALUES (?, ?, ?, ?, ?, vector32(?), ? ${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `?`).join(', ') : ''})`,
            args: [
              nanoid(),
              item.id,
              chunk.text,
              true,
              'text',
              JSON.stringify(embedding),
              JSON.stringify(chunk.metadata ?? {}),
              ...extendColumns.map(x => x.value),
            ],
          };
        });
        await this.libSQLClient.batch(insertStatements);
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

        const { text_embeddings: embeddings } = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text));
        const insertStatements = chunks.map((chunk, index) => ({
          sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `"${x.column}"`).join(', ') : ''})
        VALUES (?, ?, ?, ?, ?, vector32(?), ? ${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `?`).join(', ') : ''})`,
          args: [
            nanoid(),
            item.id,
            chunk.text,
            true,
            'text',
            JSON.stringify(embeddings[index]),
            JSON.stringify(chunk.metadata ?? {}),
            ...extendColumns.map(x => x.value),
          ],
        }));
        await this.libSQLClient.batch(insertStatements);
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

          if (mime.lookup(file).startsWith('image/')) {
            embeddings = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text), [file]);
          } else {
            embeddings = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text));
          }
          const insertStatements = [];
          const hasText = embeddings?.text_embeddings?.[0] !== undefined;
          const hasImage = embeddings?.image_embeddings?.[0] !== undefined;


          if (chunks && chunks.length > 0) {
            for (const [chunkIndex, chunk] of Object.entries(chunks)) {
              insertStatements.push({
                sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `"${x.column}"`).join(', ') : ''})
              VALUES (?, ?, ?, ?, ?, vector32(?), ? ${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `?`).join(', ') : ''})`,
                args: [
                  nanoid(),
                  item.id,
                  chunk.text,
                  true,
                  'text',
                  JSON.stringify(embeddings.text_embeddings[chunkIndex]),
                  JSON.stringify(chunk.metadata ?? {}),
                  ...extendColumns.map(x => x.value),
                ],
              });
            }
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
              sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata${extendColumns.length > 0 ? ', ' + extendColumns.map(x => `"${x.column}"`).join(', ') : ''})
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





          await this.libSQLClient.batch(insertStatements);

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
