import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { createShell, runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import pathUtil from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import os from 'os';
import { spawn } from 'child_process';
import { glob } from 'fast-glob';

export class Glob extends BaseTool {
  id: string = 'Glob';
  description: string = `- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/\\*.js" or "src/**/\\*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.`;
  inputSchema = z.object({
    pattern: z
      .string()
      .describe(
        "The glob pattern to match files against (e.g., '**/*.py', 'docs/*.md').",
      ),
    path: z
      .string()
      .optional()
      .describe(
        'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
      ),
  });
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { pattern, path } = inputData;
    const { requestContext } = context;
    const abortSignal = context?.abortSignal;
    const isWindows = os.platform() === 'win32';
    let cwd;
    if (path) {
      if (pathUtil.isAbsolute(path)) {
        cwd = path;
      } else {
        cwd = pathUtil.join(
          requestContext.get('workspace' as never) as string,
          path,
        );
      }
    } else {
      cwd = requestContext.get('workspace' as never) as string;
    }

    if (cwd && fs.existsSync(cwd) && !fs.statSync(cwd).isDirectory()) {
      throw new Error(`Directory ${cwd} is not a directory`);
    }

    const entries = await glob.async(pattern, {
      cwd: path,
      caseSensitiveMatch: false,
      dot: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/.DS_Store'],
    });
    if (entries.length === 0) {
      return `No files found`;
    }
    if (entries.length > 140) {
      return (
        entries.slice(0, 140).join('\n') +
        `\n(Results are truncated. Consider using a more specific path or pattern.)`
      );
    }
    return entries.join('\n');
  };
}
