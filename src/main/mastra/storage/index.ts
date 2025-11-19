import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { MastraVector } from '@mastra/core/vector';
import { getDbPath } from '../../utils';

export const getStorage = () => {
  return new LibSQLStore({
    id: 'libsql-agent-storage',
    url: `file:${getDbPath()}`,
  });
};

export const getVectorStore = () => {
  return new LibSQLVector({
    id: 'libsql-agent-vector',
    connectionUrl: `file:${getDbPath()}`,
  });
};
