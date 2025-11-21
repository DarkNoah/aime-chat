import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { BaseManager } from '../BaseManager';
import { dbManager } from '../db';
import { channel } from '../ipc/IpcController';
import { KnowledgeBaseChannel } from '@/types/ipc-channel';
import {
  CreateKnowledgeBase,
  UpdateKnowledgeBase,
} from '@/types/knowledge-base';
import { Repository } from 'typeorm';
import { getStorage } from '../mastra/storage';
import { Client as LibSQLClient } from '@libsql/client';
import { nanoid } from '@/utils/nanoid';
import { providersManager } from '../providers';

export class KnowledgeBaseManager extends BaseManager {
  knowledgeBaseRepository: Repository<KnowledgeBase>;
  libSQLClient: LibSQLClient;
  public async init() {
    this.knowledgeBaseRepository =
      dbManager.dataSource.getRepository(KnowledgeBase);
    this.libSQLClient = dbManager.getLocalLibSQLClient();
  }

  @channel(KnowledgeBaseChannel.Create)
  public async createKnowledgeBase(data: CreateKnowledgeBase) {
    const kbId = nanoid();

    const embeddingModel = await providersManager.getEmbeddingModel(
      data.embedding,
    );
    const res2 = await embeddingModel.doEmbed({ values: ['asdasdsad'] });
    const embedding_length = res2.embeddings[0].length;

    if (embedding_length == 0) {
      throw new Error('Embedding length is 0');
    }

    const res = await this.libSQLClient.execute({
      sql: `CREATE TABLE IF NOT EXISTS [kb_${kbId}_${embedding_length}] (
      id TEXT PRIMARY KEY,
      item_id TEXT,
      chunk TEXT,
      is_enable BOOLEAN,
      [embedding] F32_BLOB(${embedding_length}) NULL,
      [metadata] TEXT NULL DEFAULT '{}')`,
      args: [],
    });

    await this.knowledgeBaseRepository.save({
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
  public async getKnowledgeBase(id: string) {
    const kb = await this.knowledgeBaseRepository.findOneBy({ id });
    return kb;
  }

  @channel(KnowledgeBaseChannel.GetList)
  public async getKnowledgeBaseList() {
    const kbs = await this.knowledgeBaseRepository.find();
    return kbs;
  }
}

export const knowledgeBaseManager = new KnowledgeBaseManager();
export default knowledgeBaseManager;
