import { LibSQLStore, LibSQLVector } from "@mastra/libsql";
import { MastraVector } from "@mastra/core/vector";
import { getDbPath } from "../../utils";

export const getStorage = () => {
  return new LibSQLStore({
      url: `file:${getDbPath()}`,
    });
};

export const getVectorStore = () => {
  return new LibSQLVector({
      connectionUrl: `file:${getDbPath()}`,
    });
};
