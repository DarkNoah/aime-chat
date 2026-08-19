import fs from "fs";
import path from "path";
import knowledgeBaseManager from "@/main/knowledge-base";
import BaseTool, { BaseToolParams } from "../base-tool";
import BaseToolkit, { BaseToolkitParams } from "../base-toolkit";
import { ToolExecutionContext } from "@mastra/core/tools";
import { z, ZodSchema } from "zod";
import {
  CreateKnowledgeBase,
  KnowledgeBaseSourceType,
  SearchKnowledgeBaseItemResult,
  VectorStoreType,
} from "@/types/knowledge-base";
import { createGraphRAGTool } from '@mastra/rag';
import { providersManager } from "@/main/providers";
import { appManager } from "@/main/app";
import {
  createKnowledgeBaseGraphVectorStore,
  getKnowledgeBaseGraphIndexName,
} from "./graph-vector-store";
import {
  DEFAULT_MAX_KNOWLEDGE_BASE_LINES,
  MAX_KNOWLEDGE_BASE_LINE_LENGTH,
  readKnowledgeBaseContent,
} from './content-reader';


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
Search results normally contain matched chunks. To inspect the original source text, call KnowledgeBaseGetItem with the returned item id. For long sources, use its pattern parameter to locate relevant passages and offset/limit to read additional sections.

The optional where parameter filters chunks by configured extended columns before ranking. Call KnowledgeBaseList first to discover the columns shared by the selected knowledge bases. It supports AND, OR, parentheses, =, !=, <>, <, <=, >, >=, IN, NOT IN, LIKE, NOT LIKE, IS NULL, and IS NOT NULL. Quote text values with single quotes and wrap column names containing spaces in brackets.
Example: category = 'docs' AND (year >= 2024 OR featured = TRUE)

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
    query_type: z.enum(['text', 'image']).describe("Type of the query. Use 'text' for plain text search (default), or 'image' when query is a local image file path.").default('text'),
    kb_source: z.array(z.string()).describe('knowledge base id or name.'),
    where: z
      .string()
      .max(2000)
      .describe(
        "Optional SQL-like condition over configured extended columns, applied before ranking. Example: category = 'docs' AND year >= 2024. Use KnowledgeBaseList to discover valid columns.",
      )
      .optional()
      .nullable(),
    filter: z
      .string()
      .max(2000)
      .describe(
        'Legacy alias for where. Prefer where and do not set both parameters.',
      )
      .optional()
      .nullable(),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe('The number of results to return (1-100).')
      .optional()
      .default(10),
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
    const {
      query,
      query_type,
      kb_source,
      top_k,
      return_full_content = false,
      where,
      filter,
    } = inputData;
    if (where?.trim() && filter?.trim()) {
      throw new Error('Use either where or filter, not both');
    }
    const searchFilter = where?.trim() || filter?.trim() || undefined;
    const fileType = this.resolveQueryType(query, query_type);
    const results: Record<string, { id: string, name: string, score: number, content?: string }[]> = {};
    for (const source of kb_source) {
      const knowledgeBase = await knowledgeBaseManager.searchKnowledgeBase(
        source,
        query,
        fileType,
        searchFilter,
        top_k,
      );
      results[source] = knowledgeBase.results.map((x) => {
        let content = x.chunk;
        if (
          return_full_content === true ||
          knowledgeBase.forceReturnFullContent === true
        ) {
          content = x.content;
        }
        return {
          id: x.itemId,
          name: x.name,
          score: x.hybridScore,
          content,
          extendValues: x.extendValues,
        };
      });
    }
    return results;
  }
}

export class KnowledgeBaseGraphSearch extends BaseTool {
  static readonly toolName = 'KnowledgeBaseGraphSearch';
  id: string = 'KnowledgeBaseGraphSearch';
  description = `Search one knowledge base with GraphRAG.

Use this tool when an answer depends on relationships between chunks, concepts, or documents. It first finds semantically relevant chunks, builds a graph from their embedding similarity, and traverses that graph to surface connected context.

For direct fact lookup without relationship traversal, use KnowledgeBaseSearch instead.`;

  inputSchema = z.object({
    query: z
      .string()
      .min(1)
      .describe('The relationship-oriented question to search for.'),
    kb_source: z.string().min(1).describe('Knowledge base id or name.'),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(10)
      .describe('Maximum number of graph results to return.'),
    threshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.7)
      .describe(
        'Embedding similarity threshold for graph edges. Higher values create a sparser graph.',
      ),
    random_walk_steps: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(100)
      .describe('Number of graph traversal steps.'),
    restart_probability: z
      .number()
      .gt(0)
      .lt(1)
      .optional()
      .default(0.15)
      .describe(
        'Probability that graph traversal restarts from a directly relevant chunk.',
      ),
    include_sources: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to include source metadata with the returned context.',
      ),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const {
      query,
      kb_source,
      top_k,
      threshold,
      random_walk_steps,
      restart_probability,
      include_sources,
    } = inputData;
    const knowledgeBases = await knowledgeBaseManager.getKnowledgeBaseList();
    const knowledgeBase = knowledgeBases.find(
      (item) => item.id === kb_source || item.name === kb_source,
    );
    if (!knowledgeBase) {
      throw new Error(`Knowledge base not found: ${kb_source}`);
    }
    if (!knowledgeBase.embedding || !knowledgeBase.vectorLength) {
      throw new Error(
        `Knowledge base "${knowledgeBase.name}" does not have embeddings required by GraphRAG`,
      );
    }

    const model = await providersManager.getEmbeddingModel(
      knowledgeBase.embedding,
    );
    if (!model) {
      throw new Error(
        `Embedding model is unavailable: ${knowledgeBase.embedding}`,
      );
    }

    const indexName = getKnowledgeBaseGraphIndexName(
      knowledgeBase.id,
      knowledgeBase.vectorLength,
    );
    const graphTool = createGraphRAGTool({
      id: `${KnowledgeBaseGraphSearch.toolName}-${knowledgeBase.id}`,
      description: this.description,
      vectorStore: createKnowledgeBaseGraphVectorStore({
        client: knowledgeBaseManager.libSQLClient,
        knowledgeBaseId: knowledgeBase.id,
        vectorLength: knowledgeBase.vectorLength,
      }),
      indexName,
      model,
      includeSources: include_sources,
      graphOptions: {
        dimension: knowledgeBase.vectorLength,
        threshold,
        randomWalkSteps: random_walk_steps,
        restartProb: restart_probability,
      },
    });
    const result = await graphTool.execute(
      { queryText: query, topK: top_k },
      (options ?? {}) as any,
    );

    return {
      knowledgeBase: {
        id: knowledgeBase.id,
        name: knowledgeBase.name,
      },
      relevantContext: result?.relevantContext ?? [],
      sources: result?.sources ?? [],
    };
  };
}

export class KnowledgeBaseGetItem extends BaseTool {
  static readonly toolName = 'KnowledgeBaseGetItem';
  id: string = 'KnowledgeBaseGetItem';
  description = `Get the Item of a knowledge base.

By default, content is returned with 1-based line numbers, up to ${DEFAULT_MAX_KNOWLEDGE_BASE_LINES} lines, and lines longer than ${MAX_KNOWLEDGE_BASE_LINE_LENGTH} characters are truncated. Use offset and limit to continue reading, or pattern to search the complete source text before pagination. pattern accepts a ripgrep-compatible regular expression or a safe grep/rg command such as grep -in "keyword".

When the parent knowledge base is configured to force full-content output, pattern, offset, limit, line numbering, and truncation are ignored and the complete original content is returned.

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
    format: z
      .enum(['text', 'json'])
      .describe('The format of the knowledge base item.')
      .optional()
      .default('text'),
    pattern: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Optional search pattern applied to the complete item content before pagination. Accepts a ripgrep-compatible regular expression or a safe grep/rg command without file paths, pipes, or redirects, for example grep -in "keyword".',
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Zero-based line or pattern-result offset. Use with limit to continue after a truncation reminder.',
      ),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        `Maximum number of lines or pattern results to return. Defaults to and is capped at ${DEFAULT_MAX_KNOWLEDGE_BASE_LINES} per call.`,
      ),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { item_id, format = 'text', pattern, offset, limit } = inputData;
    // const { writer } = options;
    const knowledgeBaseItem = await knowledgeBaseManager.getKnowledgeBaseItem(item_id);
    if (!knowledgeBaseItem) {
      throw new Error(`Knowledge base item not found: ${item_id}`);
    }
    const knowledgeBase = await knowledgeBaseManager.getKnowledgeBase(
      knowledgeBaseItem.knowledgeBaseId,
    );
    if (!knowledgeBase) {
      throw new Error(
        `Knowledge base not found: ${knowledgeBaseItem.knowledgeBaseId}`,
      );
    }
    const originalContent = knowledgeBaseItem.content ?? '';
    const content = knowledgeBase.forceReturnFullContent
      ? originalContent
      : await readKnowledgeBaseContent(originalContent, {
        pattern,
        offset,
        limit,
        abortSignal: options?.abortSignal,
      });

    if (format === 'json') {
      return {
        id: knowledgeBaseItem.id,
        title: knowledgeBaseItem.name,
        content,
        extendData: knowledgeBaseItem.extendData,
      };
    }

    return `---
id: ${knowledgeBaseItem.id}
title: ${knowledgeBaseItem.name}
source: ${knowledgeBaseItem.source}
extendData: ${JSON.stringify(knowledgeBaseItem.extendData, null, 2)}
---
${content}
`;
  };
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
When embeddingModel is omitted, the globally configured default embedding model is used.
Use skill:local:aime-chat-docs to look up the available embedding models when needed.
`;

  inputSchema = z.object({
    name: z.string().describe('Knowledge base name'),
    description: z.string().optional(),
    embeddingModel: z
      .string()
      .optional()
      .describe('Optional embedding model. Uses the global default when omitted.'),

    extendColumns: z.array(z.object({ columnType: z.enum(['text', 'blob', 'number', 'boolean']), name: z.string() })).optional(),
  });

  constructor(params?: BaseToolParams) {
    super(params);
  }

  execute = async (inputData: z.infer<typeof this.inputSchema>, options?: ToolExecutionContext<ZodSchema, any>) => {
    const { name, description, embeddingModel, extendColumns = [] } = inputData;
    const appInfo = await appManager.getInfo();
    const embedding =
      embeddingModel?.trim() ||
      appInfo.defaultModel.embeddingModel?.trim() ||
      undefined;
    const reranker =
      appInfo.defaultModel.rerankerModel?.trim() ||
      undefined;
    const data: CreateKnowledgeBase = {
      name,
      description,
      embedding,
      vectorStoreType: VectorStoreType.LibSQL,
      reranker,
      vectorStoreConfig: {
        extendColumns: extendColumns.map(x => ({ columnType: x.columnType, name: x.name }))
      }
    }
    try {
      const knowledgeBase = await knowledgeBaseManager.createKnowledgeBase(data);
      return { success: true, knowledgeBaseId: knowledgeBase.id };
    } catch (err) {
      return { success: false, error: (err as Error).message, tips: `You need to read skill:local:aime-chat-docs to get the available embedding models` };
    }

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
    // const graphSearchConfig = params?.[KnowledgeBaseGraphSearch.toolName];
    super(
      [
        new KnowledgeBaseSearch(searchConfig),
        // new KnowledgeBaseGraphSearch(graphSearchConfig),
        new KnowledgeBaseList(listConfig),
        new KnowledgeBaseAdd(addConfig),
        new KnowledgeBaseCreate(createConfig),
        new KnowledgeBaseGetItem(getItemConfig),
      ],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
