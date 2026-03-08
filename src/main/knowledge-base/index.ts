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
  async calcEmbeddings(modeId: string, texts: string[], images?: string[]): Promise<{ text_embeddings: number[][], image_embeddings: number[][] } | undefined> {
    try {
      if (this.isLocalModel(modeId)) {
        const _modelId = modeId.split('/').slice(1).join('/')
        if (this.isLocalClipModel(modeId)) {
          const model = new LocalClipModel(_modelId);
          const res2 = await model.doClip({ texts, images: images ? images : undefined });
          return { text_embeddings: res2.text_embeddings, image_embeddings: res2.image_embeddings };
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








  @channel(KnowledgeBaseChannel.Create)
  public async createKnowledgeBase(data: CreateKnowledgeBase): Promise<KnowledgeBase> {
    const kbId = nanoid();
    const { text_embeddings: embeddings } = await this.calcEmbeddings(data.embedding, ['asdasdsad']);
    let embedding_length = embeddings?.length != 1 ? undefined : embeddings[0].length;


    if (!embedding_length || embedding_length == 0) {
      throw new Error('Embedding length is 0');
    }

    const res = await this.libSQLClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS [kb_${kbId}_${embedding_length}] (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      chunk TEXT NULL,
      is_enable BOOLEAN,
      type TEXT NULL,
      [embedding] F32_BLOB(${embedding_length}) NULL,
      [metadata] TEXT NULL DEFAULT '{}')`,
      args: [],
    });

    return await this.knowledgeBaseRepository.save({
      ...data,
      id: kbId,
      vectorLength: embedding_length,
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
    const { page, size, filter, sort, order } = params;
    const [items, total] = await this.knowledgeBaseItemRepository.findAndCount({
      where: { knowledgeBaseId: id },
      skip: (page - 1) * size,
      take: size,
      order: { [sort]: order },
    });
    return {
      items: items,
      total: total,
      page: page,
      size: size,
      hasMore: total > page * size,
    };
  }
  @channel(KnowledgeBaseChannel.SearchKnowledgeBase)
  public async searchKnowledgeBase(kb_id_or_name: string, query: string, top_k: number = 10): Promise<SearchKnowledgeBaseResult> {
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
    const embeddings = await this.calcEmbeddings(kb.embedding, [query]);



    const vectorStr = `[${embeddings?.text_embeddings?.[0].join(",")}]`;
    const results = await this.libSQLClient.execute({
      sql: `
      WITH vector_scores AS (
        SELECT
          id,
          item_id,
          chunk,
          (1-vector_distance_cos(embedding, vector32(?))) as score,
          metadata,
          type,
          vector_extract(embedding) as embedding
        FROM [kb_${kb.id}_${kb.vectorLength}]
        WHERE is_enable = 1
      )
      SELECT *
      FROM vector_scores
      WHERE score > ?
      ORDER BY score DESC
      LIMIT ?`,
      args: [JSON.stringify(embeddings.text_embeddings[0]), 0.5, top_k],
    });






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
      return {
        id: item.id as string,
        itemId: item.item_id as string,
        score: item.score as number,
        hybridScore: item.hybrid_score as number ?? item.score as number,
        metadata: item.metadata,
        chunk: item.chunk as string,
        name: kbitem.name,
        source: kbitem.source,
        sourceType: kbitem.sourceType as KnowledgeBaseSourceType,
        content: kbitem.content,
      }
    });

    if (kb.reranker) {
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
  }) {
    const { kbId, source, type } = data;
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
      data: { kbId, source, type, kbName: kb.name },
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
    const { kbId, source, type } = task.data as {
      kbId: string;
      source: any;
      type: KnowledgeBaseSourceType;
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
      item.name = content.substring(0, 10);
      item.content = content;


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

        // const { embeddings } = await embedMany({
        //   model: await providersManager.getEmbeddingModel(kb.embedding),
        //   values: chunks.map((chunk) => chunk.text),
        // });

        const insertStatements = chunks.map((chunk, index) => {
          const embedding = embeddings[index];
          return {
            sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata)
        VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
            args: [
              nanoid(),
              item.id,
              chunk.text,
              true,
              'text',
              JSON.stringify(embedding),
              JSON.stringify(chunk.metadata ?? {}),
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

      const content = await webFetch.execute({
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
            metadata: true, // Optionally extract metadata
          },
        });

        // const { embeddings } = await embedMany({
        //   model: await providersManager.getEmbeddingModel(kb.embedding),
        //   values: chunks.map((chunk) => chunk.text.replaceAll(/\0/g, '')),
        // });
        const { text_embeddings: embeddings } = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text));
        const insertStatements = chunks.map((chunk, index) => ({
          sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata)
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
          if (await isBinaryFile(file)) {
            content = await new ReadBinaryFile({
              forcePDFOcr: true,
              forceWordOcr: false,
            }).execute({
              file_source: file,
              args: {}
            });
          } else {
            content = await fs.promises.readFile(file, 'utf-8');
          }
          item.content = content;

          console.log(file, content)
          item = await this.knowledgeBaseItemRepository.save(item);
          await appManager.sendEvent(KnowledgeBaseEvent.KnowledgeBaseItemsUpdated, {
            kbId: kbId,
            items: [item]
          });
          const doc = MDocument.fromText(content);
          const chunks = await doc.chunk({
            strategy: "recursive",
            maxSize: 512,
            overlap: 50,
            separators: ["\n"],
          });
          item.chunkCount = chunks.length;
          let embeddings: { text_embeddings: number[][], image_embeddings: number[][] } | undefined;
          const isImage = mime.lookup(file).startsWith('image/')
          if (mime.lookup(file).startsWith('image/')) {
            embeddings = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text), [file]);
          } else {
            embeddings = await this.calcEmbeddings(kb.embedding, chunks.map((chunk) => chunk.text));
          }
          const insertStatements = [];
          const hasText = embeddings?.text_embeddings?.[index] !== undefined;
          const hasImage = embeddings?.image_embeddings?.[index] !== undefined;


          if (chunks && chunks.length > 0) {
            for (const chunk of chunks) {
              insertStatements.push({
                sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata)
              VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
                args: [
                  nanoid(),
                  item.id,
                  chunk.text,
                  true,
                  'text',
                  JSON.stringify(embeddings.text_embeddings[index]),
                  JSON.stringify(chunk.metadata ?? {}),
                ],
              });
            }
          }

          if (hasImage) {
            insertStatements.push({
              sql: `INSERT INTO [kb_${kbId}_${kb.vectorLength}] (id, item_id, chunk, is_enable, type, embedding, metadata)
              VALUES (?, ?, ?, ?, ?, vector32(?), ?)`,
              args: [
                nanoid(),
                item.id,
                null,
                true,
                'image',
                JSON.stringify(embeddings?.image_embeddings?.[index]),
                JSON.stringify({}),
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
