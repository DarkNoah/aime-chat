import fs from "fs";
import path from "path";
import knowledgeBaseManager from "@/main/knowledge-base";
import BaseTool, { BaseToolParams } from "../base-tool";
import BaseToolkit, { BaseToolkitParams } from "../base-toolkit";
import { ToolExecutionContext } from "@mastra/core/tools";
import { z, ZodSchema } from "zod";
import { CreateKnowledgeBase, KnowledgeBaseSourceType, SearchKnowledgeBaseItemResult, VectorStoreType } from "@/types/knowledge-base";
import { createGraphRAGTool } from '@mastra/rag'


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

The query can be text or a local image file path (.png/.jpg/.jpeg/.webp/.gif/.bmp).
When query is an existing image file path, the search is performed by image similarity (requires the knowledge base to use a CLIP-like multimodal embedding model).

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
    query: z.string().describe('The query to search for. Can be plain text, or a local image file path to search by image.'),
    query_type: z.enum(['text', 'image']).describe("Optional, The type of the query. 'image' means query is a local image file path. If omitted, it is auto-detected from the query.").optional().nullable(),
    kb_source: z.array(z.string()).describe('knowledge base id or name.'),
    filter: z.string().describe('Optional, The filter of the knowledge base item.').optional().nullable(),
    top_k: z.number().describe('The number of results to return.').optional().default(10),
    return_full_content: z.boolean().describe('Optional, Whether to return the full content of the knowledge base.').optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  private static readonly IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];

  private resolveQueryType(query: string, queryType?: 'text' | 'image' | null): 'text' | 'image' {
    if (queryType === 'text') {
      return 'text';
    }
    const ext = path.extname(query).toLowerCase();
    const looksLikeImage = KnowledgeBaseSearch.IMAGE_EXTENSIONS.includes(ext);
    if (queryType === 'image') {
      if (!looksLikeImage) {
        throw new Error(`Query is not a supported image file (${KnowledgeBaseSearch.IMAGE_EXTENSIONS.join(', ')}): ${query}`);
      }
      if (!fs.existsSync(query)) {
        throw new Error(`Image file not found: ${query}`);
      }
      return 'image';
    }
    return looksLikeImage && fs.existsSync(query) ? 'image' : 'text';
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { query, query_type, kb_source, top_k, return_full_content = false, filter } = inputData;
    const { writer } = options;
    const fileType = this.resolveQueryType(query, query_type);
    const results: Record<string, { id: string, name: string, score: number, content?: string }[]> = {};
    for (const source of kb_source) {
      const knowledgeBase = await knowledgeBaseManager.searchKnowledgeBase(source, query, fileType, filter, top_k);
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

export class KnowledgeBaseGetItem extends BaseTool {
  static readonly toolName = 'KnowledgeBaseGetItem';
  id: string = 'KnowledgeBaseGetItem';
  description = `Get the Item of a knowledge base.
Return json format:
{
  "id": "1",
  "title": "file_name_or_title",
  "content": "knowledge base content",
  "extendData": {
    "column1": "value1",
    "column2": "value2",
  }
}
`;

  inputSchema = z.object({
    item_id: z.string().describe('The item id of the knowledge base.'),
    format: z.enum(['text', 'json']).describe('The format of the knowledge base item.').optional().default('text'),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { item_id, format = 'text' } = inputData;
    // const { writer } = options;
    const knowledgeBaseItem = await knowledgeBaseManager.getKnowledgeBaseItem(item_id);

    if (format === 'json') {

      return {
        id: knowledgeBaseItem.id,
        title: knowledgeBaseItem.name,
        content: knowledgeBaseItem.content,
        extendData: knowledgeBaseItem.extendData,
      }
    }


    return `---
id: ${knowledgeBaseItem.id}
title: ${knowledgeBaseItem.name}
source: ${knowledgeBaseItem.source}
extendData: ${JSON.stringify(knowledgeBaseItem.extendData, null, 2)}
---
${knowledgeBaseItem.content}
`;
  }
}

export class KnowledgeBaseAdd extends BaseTool {
  static readonly toolName = 'KnowledgeBaseAdd';
  id: string = 'KnowledgeBaseAdd';
  description = `Import a knowledge base source.
Make sure the extended columns exist in the knowledge base in use. Use KnowledgeBaseList to retrieve the available extended columns.- if type is Text, source should be a string.

- if type is File, source should be a file full path.
- if type is Folder, source should be a folder full path.
- if type is Web, source should be a web url.
`;

  inputSchema = z.object({
    kb_source: z.string().describe('Knowledge Base id or name to add.'),
    type: z.enum([KnowledgeBaseSourceType.Text, KnowledgeBaseSourceType.File, KnowledgeBaseSourceType.Folder, KnowledgeBaseSourceType.Web]).describe('The type of the knowledge base.'),
    source: z.string().describe('The source of the knowledge base item.'),
    extendColumns: z.array(z.object({ column: z.string(), value: z.any() })).optional().nullable().describe('The extend columns of the knowledge base item.'),
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
    const kbExtendColumns = kb.vectorStoreConfig?.extendColumns ?? [];
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

    let data;
    if (type == KnowledgeBaseSourceType.Text) {
      data = { content: source };
    } else if (type == KnowledgeBaseSourceType.File) {
      data = { files: [source] };
    } else if (type == KnowledgeBaseSourceType.Folder) {
      data = source;
    } else if (type == KnowledgeBaseSourceType.Web) {
      data = { url: source };
    }

    const knowledgeBase = await knowledgeBaseManager.importSource({ kbId: kb.id, source: data, type, extendColumns: (extendColumns ?? []).map(x => ({ column: x.column, value: x.value })) });
    return { success: true };
  }
}

export class KnowledgeBaseCreate extends BaseTool {
  static readonly toolName = 'KnowledgeBaseCreate';
  id: string = 'KnowledgeBaseCreate';
  description = `Create a knowledge base.
Use skill:local:aime-chat-docs to look up the available embedding models.
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
    const getItemConfig = params?.[KnowledgeBaseGetItem.toolName];
    super(
      [new KnowledgeBaseSearch(searchConfig), new KnowledgeBaseList(listConfig), new KnowledgeBaseAdd(addConfig), new KnowledgeBaseCreate(createConfig), new KnowledgeBaseGetItem(getItemConfig)],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
