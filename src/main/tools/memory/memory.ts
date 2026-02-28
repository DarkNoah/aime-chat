import { ToolExecutionContext } from '@mastra/core/tools';
import z, { ZodSchema } from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import fs from 'fs';
import path from 'path';
import { getDataPath } from '@/main/utils';

const getMemoryDir = () => {
  const dir = getDataPath('memory');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getDailyDir = () => {
  const dir = path.join(getMemoryDir(), 'daily');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getMemoryFilePath = () => path.join(getMemoryDir(), 'MEMORY.md');

const getDailyFilePath = (date: string) =>
  path.join(getDailyDir(), `${date}.md`);

const formatDate = (d: Date) => d.toISOString().slice(0, 10);

const formatTime = (d: Date) =>
  d.toTimeString().slice(0, 5);

const readFileIfExists = (filePath: string): string | null => {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
};

export class MemoryWrite extends BaseTool {
  static readonly toolName = 'MemoryWrite';
  id: string = 'MemoryWrite';
  description = `Write or append content to global memory files (Markdown-based, persistent across all sessions).
- Use target "daily" to append timestamped entries to today's daily log (memory/daily/YYYY-MM-DD.md).
- Use target "long_term" to write to MEMORY.md for durable facts, preferences, decisions, and conventions.
- Daily logs are append-only with automatic timestamps. MEMORY.md supports both append and full replace.
- Day-to-day notes and running context go to daily logs. Decisions, preferences, and durable facts go to MEMORY.md.`;

  inputSchema = z.object({
    target: z
      .enum(['daily', 'long_term'])
      .describe(
        '"daily" appends to today\'s log (memory/daily/YYYY-MM-DD.md); "long_term" writes to MEMORY.md',
      ),
    content: z
      .string()
      .min(1)
      .describe('The text content to write to memory'),
    mode: z
      .enum(['append', 'replace'])
      .optional()
      .default('append')
      .describe(
        '"append" adds to existing content (default); "replace" overwrites entirely (only for long_term)',
      ),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, content, mode = 'append' } = inputData;

    if (target === 'daily') {
      const today = formatDate(new Date());
      const filePath = getDailyFilePath(today);
      const timestamp = formatTime(new Date());
      const entry = `\n- [${timestamp}] ${content}\n`;

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# ${today}\n${entry}`, 'utf-8');
      } else {
        fs.appendFileSync(filePath, entry, 'utf-8');
      }

      return `Memory appended to daily log (${today}).`;
    }

    const filePath = getMemoryFilePath();

    if (mode === 'replace') {
      fs.writeFileSync(filePath, content, 'utf-8');
      return 'MEMORY.md has been replaced with new content.';
    }

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# Long-term Memory\n\n${content}\n`, 'utf-8');
    } else {
      fs.appendFileSync(filePath, `\n${content}\n`, 'utf-8');
    }

    return 'Content appended to MEMORY.md.';
  };
}

export class MemoryRead extends BaseTool {
  static readonly toolName = 'MemoryRead';
  id: string = 'MemoryRead';
  description = `Read global memory files.
- "recent": returns MEMORY.md + today's and yesterday's daily logs (recommended at session start).
- "today" / "yesterday": returns the corresponding daily log.
- "date": returns the daily log for a specific date (requires date parameter in YYYY-MM-DD format).
- "long_term": returns MEMORY.md only.`;

  inputSchema = z.object({
    target: z
      .enum(['recent', 'today', 'yesterday', 'date', 'long_term'])
      .describe('Which memory to read'),
    date: z
      .string()
      .optional()
      .describe('Date in YYYY-MM-DD format (required when target is "date")'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, date } = inputData;
    const now = new Date();
    const today = formatDate(now);
    const yesterday = formatDate(
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );

    if (target === 'long_term') {
      const content = readFileIfExists(getMemoryFilePath());
      return content ?? 'MEMORY.md does not exist yet. No long-term memories stored.';
    }

    if (target === 'today') {
      const content = readFileIfExists(getDailyFilePath(today));
      return content ?? `No daily log for ${today}.`;
    }

    if (target === 'yesterday') {
      const content = readFileIfExists(getDailyFilePath(yesterday));
      return content ?? `No daily log for ${yesterday}.`;
    }

    if (target === 'date') {
      if (!date) {
        return 'Error: date parameter is required when target is "date".';
      }
      const content = readFileIfExists(getDailyFilePath(date));
      return content ?? `No daily log for ${date}.`;
    }

    // target === 'recent'
    const sections: string[] = [];

    const longTerm = readFileIfExists(getMemoryFilePath());
    if (longTerm) {
      sections.push(`## MEMORY.md (Long-term)\n\n${longTerm}`);
    }

    const todayLog = readFileIfExists(getDailyFilePath(today));
    if (todayLog) {
      sections.push(`## Daily Log: ${today}\n\n${todayLog}`);
    }

    const yesterdayLog = readFileIfExists(getDailyFilePath(yesterday));
    if (yesterdayLog) {
      sections.push(`## Daily Log: ${yesterday}\n\n${yesterdayLog}`);
    }

    if (sections.length === 0) {
      return 'No memories found. Memory files have not been created yet.';
    }

    return sections.join('\n\n---\n\n');
  };
}

export class MemorySearch extends BaseTool {
  static readonly toolName = 'MemorySearch';
  id: string = 'MemorySearch';
  description = `Search across all global memory files (MEMORY.md and daily logs) by keyword.
Returns matching lines with file names and line numbers.`;

  inputSchema = z.object({
    query: z
      .string()
      .min(1)
      .describe('Keyword or phrase to search for (case-insensitive)'),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe('Maximum number of matching lines to return'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { query, limit = 20 } = inputData;
    const queryLower = query.toLowerCase();

    const filesToSearch: { name: string; filePath: string }[] = [];

    const memoryFile = getMemoryFilePath();
    if (fs.existsSync(memoryFile)) {
      filesToSearch.push({ name: 'MEMORY.md', filePath: memoryFile });
    }

    const dailyDir = path.join(getMemoryDir(), 'daily');
    if (fs.existsSync(dailyDir)) {
      const dailyFiles = fs
        .readdirSync(dailyDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse();
      for (const f of dailyFiles) {
        filesToSearch.push({
          name: `daily/${f}`,
          filePath: path.join(dailyDir, f),
        });
      }
    }

    if (filesToSearch.length === 0) {
      return 'No memory files exist yet.';
    }

    const results: { file: string; line: number; text: string }[] = [];

    for (const { name, filePath } of filesToSearch) {
      if (results.length >= limit) break;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= limit) break;
        if (lines[i].toLowerCase().includes(queryLower)) {
          results.push({ file: name, line: i + 1, text: lines[i] });
        }
      }
    }

    if (results.length === 0) {
      return `No matches found for "${query}".`;
    }

    const formatted = results
      .map((r) => `${r.file}:${r.line} | ${r.text}`)
      .join('\n');

    return `Found ${results.length} match(es) for "${query}":\n\n${formatted}`;
  };
}

export class MemoryDelete extends BaseTool {
  static readonly toolName = 'MemoryDelete';
  id: string = 'MemoryDelete';
  description = `Delete memory content.
- target "daily" with a date: deletes the entire daily log file for that date.
- target "long_term" without content: deletes the entire MEMORY.md file.
- target "long_term" with content: removes matching lines/paragraphs from MEMORY.md.`;

  inputSchema = z.object({
    target: z
      .enum(['daily', 'long_term'])
      .describe('Which memory to delete from'),
    date: z
      .string()
      .optional()
      .describe(
        'Date in YYYY-MM-DD format (required when target is "daily")',
      ),
    content: z
      .string()
      .optional()
      .describe(
        'Specific text to remove from MEMORY.md. If omitted for long_term, the entire file is deleted.',
      ),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    _context: ToolExecutionContext<ZodSchema, any>,
  ) => {
    const { target, date, content } = inputData;

    if (target === 'daily') {
      if (!date) {
        return 'Error: date parameter is required when target is "daily".';
      }
      const filePath = getDailyFilePath(date);
      if (!fs.existsSync(filePath)) {
        return `No daily log found for ${date}.`;
      }
      fs.unlinkSync(filePath);
      return `Daily log for ${date} has been deleted.`;
    }

    // target === 'long_term'
    const filePath = getMemoryFilePath();
    if (!fs.existsSync(filePath)) {
      return 'MEMORY.md does not exist.';
    }

    if (!content) {
      fs.unlinkSync(filePath);
      return 'MEMORY.md has been deleted.';
    }

    const existing = fs.readFileSync(filePath, 'utf-8');
    const updated = existing.replace(content, '').replace(/\n{3,}/g, '\n\n');
    fs.writeFileSync(filePath, updated, 'utf-8');
    return 'Matching content removed from MEMORY.md.';
  };
}

class MemoryToolkit extends BaseToolkit {
  static readonly toolName: string = 'MemoryToolkit';
  id = 'MemoryToolkit';
  constructor(params?: BaseToolkitParams) {
    super(
      [
        new MemoryWrite(),
        new MemoryRead(),
        new MemorySearch(),
        new MemoryDelete(),
      ],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
export default MemoryToolkit;
