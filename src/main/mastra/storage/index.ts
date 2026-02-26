import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
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
    url: `file:${getDbPath()}`,
  });
};
