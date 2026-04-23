import knowledgeBaseManager from "@/main/knowledge-base";
import BaseTool, { BaseToolParams } from "../base-tool";
import BaseToolkit, { BaseToolkitParams } from "../base-toolkit";
import { ToolExecutionContext } from "@mastra/core/tools";
import { z, ZodSchema } from "zod";
import { CreateKnowledgeBase, KnowledgeBaseSourceType, SearchKnowledgeBaseItemResult, VectorStoreType } from "@/types/knowledge-base";



export class KnowledgeBaseList extends BaseTool {
  static readonly toolName = 'KnowledgeBaseList';
  id: string = 'KnowledgeBaseList';
  description = `List all knowledge bases.`;

  inputSchema = z.object({

  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { } = inputData;
    const { writer } = options;
    const knowledgeBases = await knowledgeBaseManager.getKnowledgeBaseList();
    return knowledgeBases.map(x => { return { id: x.id, name: x.name, description: x.description, extendColumns: x.vectorStoreConfig?.extendColumns } });
  }
}

export class KnowledgeBaseSearch extends BaseTool {
  static readonly toolName = 'KnowledgeBaseSearch';
  id: string = 'KnowledgeBaseSearch';
  description = `Search for knowledge bases.

Filter:


Return json format:
{
  "source_name_or_id_1": [
    {
      "id": "1",
      "name": "file_name_or_title",
      "score": 0.95,
      "content": "knowledge base content",
      "extendValues": {
        "column1": "value1",
        "column2": "value2",
        ...
      }
    }
  ],
  "source_name_or_id_2": []
}


`;

  inputSchema = z.object({
    query: z.string().describe('The query to search for.'),
    kb_source: z.array(z.string()).describe('knowledge base id or name.'),
    filter: z.string().describe('Optional, The filter of the knowledge base item.').optional(),
    top_k: z.number().describe('The number of results to return.').optional().default(10),
    return_full_content: z.boolean().describe('Optional, Whether to return the full content of the knowledge base.').optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { query, kb_source, top_k, return_full_content = false, filter } = inputData;
    const { writer } = options;
    const results: Record<string, { id: string, name: string, score: number, content?: string }[]> = {};
    for (const source of kb_source) {
      const knowledgeBase = await knowledgeBaseManager.searchKnowledgeBase(source, query, 'text', filter, top_k);
      results[source] = knowledgeBase.results.map(x => {
        let content = x.chunk;
        if (return_full_content === true) {
          content = x.content;
        }
        return { id: x.itemId, name: x.name, score: x.hybridScore, content: content, extendValues: x.extendValues }
      });
    }
    return results;
  }
}


export class KnowledgeBaseAdd extends BaseTool {
  static readonly toolName = 'KnowledgeBaseAdd';
  id: string = 'KnowledgeBaseAdd';
  description = `Import a knowledge base source.

- if type is Text, source should be a string.
- if type is File, source should be a file full path.
- if type is Folder, source should be a folder full path.
- if type is Web, source should be a web url.
`;

  inputSchema = z.object({
    kb_source: z.string().describe('Knowledge Base id or name to add.'),
    type: z.enum([KnowledgeBaseSourceType.Text, KnowledgeBaseSourceType.File, KnowledgeBaseSourceType.Folder, KnowledgeBaseSourceType.Web]).describe('The type of the knowledge base.'),
    source: z.string().describe('The source of the knowledge base item.'),
    extendColumns: z.array(z.object({ column: z.string(), value: z.any() })).optional().describe('The extend columns of the knowledge base item.'),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { kb_source, type, source, extendColumns = [] } = inputData;
    const { writer } = options;
    const knowledgeBases = await knowledgeBaseManager.getKnowledgeBaseList();
    const kbId = knowledgeBases.find(x => x.name === kb_source || x.id === kb_source)?.id;
    if (!kbId) {
      throw new Error('Knowledge base not found');
    }
    const kb = await knowledgeBaseManager.getKnowledgeBase(kbId);
    const kbExtendColumns = kb.vectorStoreConfig.extendColumns ?? [];
    if (extendColumns?.length > 0) {
      for (const column of extendColumns) {
        if (kbExtendColumns.find(x => x.name === column.column)) {
          continue;
        }
        else {
          throw new Error(`Extend column ${column.column} not found in knowledge base.
Full extend columns:
${JSON.stringify(kbExtendColumns, null, 2)}`);
        }
      }
    }




    const knowledgeBase = await knowledgeBaseManager.importSource({ kbId: kb_source, source, type, extendColumns: extendColumns.map(x => ({ column: x.column, value: x.value })) });
    return { success: true };
  }
}

export class KnowledgeBaseCreate extends BaseTool {
  static readonly toolName = 'KnowledgeBaseCreate';
  id: string = 'KnowledgeBaseCreate';
  description = `Create a knowledge base.
`;

  inputSchema = z.object({
    name: z.string().describe('Knowledge base name'),
    description: z.string().optional(),
    embeddingModel: z.string().describe('Embedding model'),

    extendColumns: z.array(z.object({ columnType: z.enum(['text', 'blob', 'number', 'boolean']), name: z.string() })).optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { name, description, embeddingModel, extendColumns = [] } = inputData;
    const { writer } = options;
    const data: CreateKnowledgeBase = {
      name,
      description,
      embedding: embeddingModel,
      vectorStoreType: VectorStoreType.LibSQL,
      vectorStoreConfig: {
        extendColumns: extendColumns.map(x => ({ columnType: x.columnType, name: x.name }))
      }
    }
    const knowledgeBase = await knowledgeBaseManager.createKnowledgeBase(data);

    return { success: true };
  }
}

export class KnowledgeBaseToolkit extends BaseToolkit {
  static readonly toolName = 'KnowledgeBaseToolkit';
  id: string = 'KnowledgeBaseToolkit';
  description = 'Knowledge base toolkit for searching and analyzing knowledge bases.';

  constructor(params?: BaseToolkitParams) {
    const searchConfig = params?.[KnowledgeBaseSearch.toolName];
    const listConfig = params?.[KnowledgeBaseList.toolName];
    const addConfig = params?.[KnowledgeBaseAdd.toolName];
    const createConfig = params?.[KnowledgeBaseCreate.toolName];
    super(
      [new KnowledgeBaseSearch(searchConfig), new KnowledgeBaseList(listConfig), new KnowledgeBaseAdd(addConfig), new KnowledgeBaseCreate(createConfig)],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
