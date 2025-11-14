import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDbPath } from '../utils';
import { Providers } from '@/entities/providers';
import { Settings } from '@/entities/settings';
import { createClient, Client as LibSQLClient } from '@libsql/client';
import { KnowledgeBase, KnowledgeBaseItem } from '@/entities/knowledge-base';
import { Secrets } from '@/entities/secrets';

class DBManager {
  // defaultDb: Database;
  public dataSource: DataSource;
  public localLibSQLClient: LibSQLClient;

  constructor() {}
  async init() {
    this.dataSource = new DataSource({
      type: 'better-sqlite3',
      database: getDbPath(),
      synchronize: true,
      logging: false,
      entities: [
        Providers,
        Settings,
        KnowledgeBase,
        KnowledgeBaseItem,
        Secrets,
      ],
      // migrationsRun: true,
      // migrations: [],
      // subscribers: [],
    });
    await this.dataSource.initialize();
    console.log('DB initialized');
  }

  getLocalLibSQLClient() {
    if (!this.localLibSQLClient) {
      this.localLibSQLClient = createClient({
        url: `file:${getDbPath()}`,
      });
    }
    return this.localLibSQLClient;
  }
}
export const dbManager = new DBManager();
