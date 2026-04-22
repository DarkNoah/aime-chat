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
    return knowledgeBases.map(x => { return { id: x.id, name: x.name, description: x.description } });
  }
}

export class KnowledgeBaseSearch extends BaseTool {
  static readonly toolName = 'KnowledgeBaseSearch';
  id: string = 'KnowledgeBaseSearch';
  description = `Search for knowledge bases.

Return json format:
{
  "source_name_or_id_1": [
    {
      "id": "1",
      "name": "file_name_or_title",
      "score": 0.95,
      "content": "knowledge base content"
    }
  ],
  "source_name_or_id_2": []
}


`;

  inputSchema = z.object({
    query: z.string().describe('The query to search for.'),
    knowledge_base_source: z.array(z.string()).describe('The sources of the knowledge base to search.'),
    top_k: z.number().describe('The number of results to return.').optional().default(10),
    return_full_content: z.boolean().describe('Whether to return the full content of the knowledge base.').optional().default(false),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { query, knowledge_base_source, top_k, return_full_content = false } = inputData;
    const { writer } = options;
    const results: Record<string, { id: string, name: string, score: number, content?: string }[]> = {};
    for (const source of knowledge_base_source) {
      const knowledgeBase = await knowledgeBaseManager.searchKnowledgeBase(source, query, 'text', top_k);
      results[source] = knowledgeBase.results.map(x => {
        let content = x.chunk;
        if (return_full_content === true) {
          content = x.content;
        }
        return { id: x.itemId, name: x.name, score: x.hybridScore, content: content }
      });
    }
    return results;
  }
}


export class KnowledgeBaseAdd extends BaseTool {
  static readonly toolName = 'KnowledgeBaseAdd';
  id: string = 'KnowledgeBaseAdd';
  description = `Add a knowledge base item.
`;

  inputSchema = z.object({
    knowledge_base_source: z.string().describe('Knowledge base id or name to add.'),
    type: z.enum([KnowledgeBaseSourceType.Text, KnowledgeBaseSourceType.File, KnowledgeBaseSourceType.Folder, KnowledgeBaseSourceType.Web]).describe('The type of the knowledge base.'),
    source: z.any().describe('The source of the knowledge base item.'),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { knowledge_base_source, type, source } = inputData;
    const { writer } = options;
    const knowledgeBases = await knowledgeBaseManager.getKnowledgeBaseList();
    const kbId = knowledgeBases.find(x => x.name === knowledge_base_source || x.id === knowledge_base_source)?.id;
    if (!kbId) {
      throw new Error('Knowledge base not found');
    }

    const knowledgeBase = await knowledgeBaseManager.importSource({ kbId: knowledge_base_source, source, type });
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
    extendColumns: z.array(z.object({ columnType: z.enum(['text', 'blob', 'number', 'boolean']), name: z.string() })).optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { name, description, extendColumns = [] } = inputData;
    const { writer } = options;
    const data: CreateKnowledgeBase = {
      name,
      description,
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
    super(
      [new KnowledgeBaseSearch(searchConfig), new KnowledgeBaseList(listConfig), new KnowledgeBaseAdd(addConfig)],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
