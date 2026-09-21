/* eslint-disable import/no-cycle, max-classes-per-file */
import { ToolExecutionContext } from '@mastra/core/tools';
import z, { ZodSchema } from 'zod';
import BaseTool from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import {
  INDEX_DOC_NAME,
  LOG_DOC_NAME,
  appendToLog,
  getMemoryItemByName,
  getMemoryItemById,
  getOrCreateMemoryKB,
  listMemoryPage,
  searchMemory,
  upsertMemoryItem,
} from '@/main/knowledge-base/static-memory';
import memoryKnowledgeBaseManager from '@/main/knowledge-base';

import { resolveMemoryScope } from '../memory-scope';

const memoryType = z
  .enum(['global', 'project'])
  .optional()
  .describe(
    'Memory scope. Omit to use project memory in a project chat, otherwise global memory. Explicit project scope requires a project chat.',
  );

const SYSTEM_PAGES = new Set([INDEX_DOC_NAME, LOG_DOC_NAME]);

export class MemoryRead extends BaseTool {
  static readonly toolName = 'MemoryRead';

  id: string = 'MemoryRead';

  description = `Read from the selected memory wiki (a persistent, LLM-maintained knowledge base).
- target "index": returns the full ${INDEX_DOC_NAME} (table of contents of the wiki)
- target "log": returns the full ${LOG_DOC_NAME} (timeline of memory updates)
- target "page": returns a specific page by name or itemId (use itemId when titles repeat)
- target "recent": returns ${INDEX_DOC_NAME} + recent ${LOG_DOC_NAME} entries + most recently updated pages`;

  inputSchema = z.object({
    type: memoryType,
    target: z.enum(['index', 'log', 'page', 'recent']).describe('What to read'),
    name: z
      .string()
      .optional()
      .describe('Page title or filename when target is page (or use itemId)'),
    itemId: z
      .string()
      .optional()
      .describe(
        'Exact item ID from MemoryList or MemorySearch; takes precedence over name when target is page',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(5)
      .describe('For "recent": number of recently updated pages to include'),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, name, itemId, limit = 5 } = inputData;
    const scope = await resolveMemoryScope(inputData.type, context);
    const kb = await getOrCreateMemoryKB(scope);
    if (!kb) {
      return 'Memory is not initialized yet. Please configure a default embedding model first.';
    }

    if (target === 'index') {
      const item = await getMemoryItemByName(INDEX_DOC_NAME, scope);
      return item?.content ?? `${INDEX_DOC_NAME} is empty.`;
    }
    if (target === 'log') {
      const item = await getMemoryItemByName(LOG_DOC_NAME, scope);
      return item?.content ?? `${LOG_DOC_NAME} is empty.`;
    }
    if (target === 'page') {
      if (!name && !itemId)
        return 'Error: "name" or "itemId" is required when target is "page".';
      const item = itemId
        ? await getMemoryItemById(itemId, scope)
        : await getMemoryItemByName(name, scope);
      if (!item) return `No memory page found for "${itemId ?? name}".`;
      return item.content ?? '';
    }

    // target === 'recent'
    const sections: string[] = [];
    const indexItem = await getMemoryItemByName(INDEX_DOC_NAME, scope);
    if (indexItem?.content)
      sections.push(`## ${INDEX_DOC_NAME}\n\n${indexItem.content}`);

    const logItem = await getMemoryItemByName(LOG_DOC_NAME, scope);
    if (logItem?.content) {
      const lines = logItem.content.split('\n');
      const tail = lines.slice(-30).join('\n');
      sections.push(`## ${LOG_DOC_NAME} (recent)\n\n${tail}`);
    }

    const { items: pages } = await listMemoryPage(scope, { limit });
    if (pages.length > 0) {
      const pageBlocks = pages.map(
        (p) => p.content ? `\`\`\`md\n${p.content}\n\`\`\`` : ``,
      );
      sections.push(`## Recent pages\n\n${pageBlocks.join('\n\n')}`);
    }

    return sections.join('\n\n---\n\n') || 'Memory is empty.';
  };
}

export class MemoryWrite extends BaseTool {
  static readonly toolName = 'MemoryWrite';

  id: string = 'MemoryWrite';

  description = `Write to the selected memory wiki.
- target "index": rewrite/append ${INDEX_DOC_NAME} (the table of contents)
- target "log": append a timestamped entry to ${LOG_DOC_NAME} (chronological record)
- target "page": create/update a topic page by name (e.g. "John Doe.md", "Project X.md")
- target "daily": create/append today's daily note (YYYY-MM-DD.md)
Use mode "replace" (default for pages) to overwrite or "append" to add to existing content.`;

  inputSchema = z.object({
    type: memoryType,
    target: z
      .enum(['index', 'log', 'page', 'daily'])
      .describe('Where to write'),
    name: z
      .string()
      .optional()
      .describe(
        'Page name including .md extension (required when target is "page")',
      ),
    content: z.string().min(1).describe('Markdown content to write'),
    mode: z
      .enum(['append', 'replace'])
      .optional()
      .describe(
        '"append" adds to existing content; "replace" overwrites entirely',
      ),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, content, mode } = inputData;
    let { name } = inputData;
    const scope = await resolveMemoryScope(inputData.type, context);
    const kb = await getOrCreateMemoryKB(scope);
    if (!kb) {
      return 'Memory is not initialized yet. Please configure a default embedding model first.';
    }

    if (target === 'log') {
      await appendToLog(content, scope);
      return `Appended entry to ${LOG_DOC_NAME}.`;
    }

    if (target === 'index') {
      await upsertMemoryItem({
        scope,
        name: INDEX_DOC_NAME,
        role: 'index',
        content,
        mode: mode ?? 'replace',
      });
      return `${INDEX_DOC_NAME} updated.`;
    }

    if (target === 'daily') {
      const today = new Date().toISOString().slice(0, 10);
      name = `${today}.md`;
      await upsertMemoryItem({
        scope,
        name,
        role: 'daily',
        content,
        mode: mode ?? 'append',
      });
      return `Daily note ${name} updated.`;
    }

    // target === 'page'
    if (!name) return 'Error: "name" is required when target is "page".';
    if (!name.endsWith('.md')) name = `${name}.md`;
    await upsertMemoryItem({
      scope,
      name,
      role: 'page',
      content,
      mode: mode ?? 'replace',
    });
    return `Memory page "${name}" updated.`;
  };
}

export class MemorySearch extends BaseTool {
  static readonly toolName = 'MemorySearch';

  id: string = 'MemorySearch';

  description = `Search across the selected memory wiki. Returns the most relevant chunks
from index, log and topic pages with their source page names.`;

  inputSchema = z.object({
    type: memoryType,
    query: z.string().min(1).describe('Natural language query'),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(8)
      .describe('Maximum number of chunks to return'),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { query, top_k: topK = 8 } = inputData;
    const scope = await resolveMemoryScope(inputData.type, context);
    const kb = await getOrCreateMemoryKB(scope);
    if (!kb) {
      return 'Memory is not initialized yet.';
    }
    const res = await searchMemory(query, topK, scope);
    if (!res.results || res.results.length === 0) {
      return `No matches in memory for "${query}".`;
    }
    return res.results
      .map((r, idx) => {
        const score =
          (r.hybridScore ?? r.score ?? 0).toFixed?.(3) ?? `${r.score}`;
        return `[${idx + 1}] ${r.name ?? '(unnamed)'} (itemId=${r.itemId}, score=${score})\n${r.chunk ?? ''}`;
      })
      .join('\n\n---\n\n');
  };
}

export class MemoryDelete extends BaseTool {
  static readonly toolName = 'MemoryDelete';

  id: string = 'MemoryDelete';

  description = `Delete a topic page from the selected memory wiki by name. ${INDEX_DOC_NAME} and ${LOG_DOC_NAME} cannot be deleted (they are system pages).`;

  inputSchema = z.object({
    type: memoryType,
    name: z.string().min(1).describe('Page name including .md extension'),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { name } = inputData;
    const scope = await resolveMemoryScope(inputData.type, context);
    if (SYSTEM_PAGES.has(name)) {
      return `Cannot delete system page "${name}".`;
    }
    const item = await getMemoryItemByName(name, scope);
    if (!item) return `No memory page named "${name}".`;
    await memoryKnowledgeBaseManager.deleteKnowledgeBaseItem(item.id);
    return `Memory page "${name}" deleted.`;
  };
}

export class MemoryList extends BaseTool {
  static readonly toolName = 'MemoryList';

  id: string = 'MemoryList';

  description = `List a page of topic and timeline items in the selected memory wiki (excluding ${INDEX_DOC_NAME} and ${LOG_DOC_NAME}). Returns name, role, and last-updated time for each page.`;

  inputSchema = z.object({
    type: memoryType,
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe('Number of memory items to skip, starting at 0'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of pages to return (1-100)'),
  });

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const scope = await resolveMemoryScope(inputData.type, context);
    const kb = await getOrCreateMemoryKB(scope);
    if (!kb) return 'Memory is not initialized yet.';
    const result = await listMemoryPage(scope, inputData);
    const pages = result.items;
    if (pages.length === 0)
      return result.total === 0
        ? 'No pages yet.'
        : `No pages at offset ${result.offset}. Total: ${result.total}; hasMore: false.`;
    const listing = pages
      .map((p) => {
        const role = (p.metadata as any)?.role ?? 'page';
        return `- ${p.name} (itemId=${p.id}, role=${role}, updated=${p.updatedAt?.toISOString?.() ?? ''})${p.metadata?.summary && p.metadata.summary !== p.name ? `: ${p.metadata.summary}` : ''}`;
      })
      .join('\n');
    return `${listing}\n\nTotal: ${result.total}; offset: ${result.offset}; limit: ${result.limit}; hasMore: ${result.hasMore}${result.hasMore ? `; nextOffset: ${result.offset + pages.length}` : ''}`;
  };
}

class MemoryToolkit extends BaseToolkit {
  static readonly toolName: string = 'MemoryToolkit';

  id = 'MemoryToolkit';

  constructor(params?: BaseToolkitParams) {
    super(
      [
        new MemoryRead(),
        new MemoryWrite(),
        new MemorySearch(),
        new MemoryDelete(),
        new MemoryList(),
      ],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
export default MemoryToolkit;
