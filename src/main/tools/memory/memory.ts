import { ToolExecutionContext } from '@mastra/core/tools';
import z, { ZodSchema } from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import {
  INDEX_DOC_NAME,
  LOG_DOC_NAME,
  MemoryRole,
  appendToLog,
  buildContextDigest,
  getMemoryItemByName,
  getOrCreateMemoryKB,
  listMemoryPages,
  searchMemory,
  upsertMemoryItem,
} from '@/main/knowledge-base/static-memory';
import knowledgeBaseManager from '@/main/knowledge-base';

const SYSTEM_PAGES = new Set([INDEX_DOC_NAME, LOG_DOC_NAME]);

export class MemoryRead extends BaseTool {
  static readonly toolName = 'MemoryRead';
  id: string = 'MemoryRead';
  description = `Read from the global memory wiki (a persistent, LLM-maintained knowledge base).
- target "index": returns the full ${INDEX_DOC_NAME} (table of contents of the wiki)
- target "log": returns the full ${LOG_DOC_NAME} (timeline of memory updates)
- target "page": returns a specific topic page by name (requires "name")
- target "recent": returns ${INDEX_DOC_NAME} + recent ${LOG_DOC_NAME} entries + most recently updated pages`;

  inputSchema = z.object({
    target: z
      .enum(['index', 'log', 'page', 'recent'])
      .describe('What to read'),
    name: z
      .string()
      .optional()
      .describe('Page name (required when target is "page", e.g. "John Doe.md")'),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe('For "recent": number of recently updated pages to include'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, name, limit = 5 } = inputData;
    const kb = await getOrCreateMemoryKB();
    if (!kb) {
      return 'Global memory is not initialized yet. Please configure a default embedding model first.';
    }

    if (target === 'index') {
      const item = await getMemoryItemByName(INDEX_DOC_NAME);
      return item?.content ?? `${INDEX_DOC_NAME} is empty.`;
    }
    if (target === 'log') {
      const item = await getMemoryItemByName(LOG_DOC_NAME);
      return item?.content ?? `${LOG_DOC_NAME} is empty.`;
    }
    if (target === 'page') {
      if (!name) return 'Error: "name" is required when target is "page".';
      const item = await getMemoryItemByName(name);
      if (!item) return `No memory page found with name "${name}".`;
      return item.content ?? '';
    }

    // target === 'recent'
    const sections: string[] = [];
    const indexItem = await getMemoryItemByName(INDEX_DOC_NAME);
    if (indexItem?.content) sections.push(`## ${INDEX_DOC_NAME}\n\n${indexItem.content}`);

    const logItem = await getMemoryItemByName(LOG_DOC_NAME);
    if (logItem?.content) {
      const lines = logItem.content.split('\n');
      const tail = lines.slice(-30).join('\n');
      sections.push(`## ${LOG_DOC_NAME} (recent)\n\n${tail}`);
    }

    const pages = await listMemoryPages();
    if (pages.length > 0) {
      const top = pages.slice(0, limit);
      const pageBlocks = top.map((p) => `### ${p.name}\n\n${p.content ?? ''}`);
      sections.push(`## Recent pages\n\n${pageBlocks.join('\n\n')}`);
    }

    return sections.join('\n\n---\n\n') || 'Global memory is empty.';
  };
}

export class MemoryWrite extends BaseTool {
  static readonly toolName = 'MemoryWrite';
  id: string = 'MemoryWrite';
  description = `Write to the global memory wiki.
- target "index": rewrite/append ${INDEX_DOC_NAME} (the table of contents)
- target "log": append a timestamped entry to ${LOG_DOC_NAME} (chronological record)
- target "page": create/update a topic page by name (e.g. "John Doe.md", "Project X.md")
- target "daily": create/append today's daily note (YYYY-MM-DD.md)
Use mode "replace" (default for pages) to overwrite or "append" to add to existing content.`;

  inputSchema = z.object({
    target: z
      .enum(['index', 'log', 'page', 'daily'])
      .describe('Where to write'),
    name: z
      .string()
      .optional()
      .describe('Page name including .md extension (required when target is "page")'),
    content: z
      .string()
      .min(1)
      .describe('Markdown content to write'),
    mode: z
      .enum(['append', 'replace'])
      .optional()
      .describe('"append" adds to existing content; "replace" overwrites entirely'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, content, mode } = inputData;
    let { name } = inputData;
    const kb = await getOrCreateMemoryKB();
    if (!kb) {
      return 'Global memory is not initialized yet. Please configure a default embedding model first.';
    }

    if (target === 'log') {
      await appendToLog(content);
      return `Appended entry to ${LOG_DOC_NAME}.`;
    }

    if (target === 'index') {
      await upsertMemoryItem({
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
  description = `Semantic search across the global memory wiki. Returns the most relevant chunks
from index, log and topic pages with their source page names.`;

  inputSchema = z.object({
    query: z.string().min(1).describe('Natural language query'),
    top_k: z
      .number()
      .optional()
      .default(8)
      .describe('Maximum number of chunks to return'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { query, top_k = 8 } = inputData;
    const kb = await getOrCreateMemoryKB();
    if (!kb) {
      return 'Global memory is not initialized yet.';
    }
    const res = await searchMemory(query, top_k);
    if (!res.results || res.results.length === 0) {
      return `No matches in memory for "${query}".`;
    }
    return res.results
      .map((r, idx) => {
        const score =
          (r.hybridScore ?? r.score ?? 0).toFixed?.(3) ?? `${r.score}`;
        return `[${idx + 1}] ${r.name ?? '(unnamed)'} (score=${score})\n${r.chunk ?? ''}`;
      })
      .join('\n\n---\n\n');
  };
}

export class MemoryDelete extends BaseTool {
  static readonly toolName = 'MemoryDelete';
  id: string = 'MemoryDelete';
  description = `Delete a topic page from the global memory wiki by name. ${INDEX_DOC_NAME} and ${LOG_DOC_NAME} cannot be deleted (they are system pages).`;

  inputSchema = z.object({
    name: z
      .string()
      .min(1)
      .describe('Page name including .md extension'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { name } = inputData;
    if (SYSTEM_PAGES.has(name)) {
      return `Cannot delete system page "${name}".`;
    }
    const item = await getMemoryItemByName(name);
    if (!item) return `No memory page named "${name}".`;
    await knowledgeBaseManager.deleteKnowledgeBaseItem(item.id);
    return `Memory page "${name}" deleted.`;
  };
}

export class MemoryList extends BaseTool {
  static readonly toolName = 'MemoryList';
  id: string = 'MemoryList';
  description = `List all topic pages in the global memory wiki (excluding ${INDEX_DOC_NAME} and ${LOG_DOC_NAME}). Returns name, role, and last-updated time for each page.`;

  inputSchema = z.object({});

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    _inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const kb = await getOrCreateMemoryKB();
    if (!kb) return 'Global memory is not initialized yet.';
    const pages = await listMemoryPages();
    if (pages.length === 0) return 'No pages yet.';
    return pages
      .map((p) => {
        const role = (p.metadata as any)?.role ?? 'page';
        return `- ${p.name} (role=${role}, updated=${p.updatedAt?.toISOString?.() ?? ''})`;
      })
      .join('\n');
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
