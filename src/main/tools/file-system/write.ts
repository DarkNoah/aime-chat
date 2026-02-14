import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import os from 'os';
import stripAnsi from 'strip-ansi';
import { spawn } from 'child_process';
import { glob } from 'fast-glob';
import { RequestContext } from '@mastra/core/request-context';
import { needReadFile, updateFileModTime } from '.';

export class Write extends BaseTool {
  static readonly toolName = 'Write';
  id: string = 'Write';
  description: string = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;
  inputSchema = z
    .object({
      file_path: z
        .string()
        .describe(
          'The absolute path to the file to write (must be absolute, not relative)',
        ),
      content: z.string().describe('The content to write to the file'),
      mode: z.enum(['append', 'overwrite']).optional().default('overwrite'),
    })
    .strict();
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    let { file_path, content, mode = 'overwrite' } = inputData;
    const { requestContext } = context;
    // const workspace = config?.configurable?.workspace;

    // if (!path.isAbsolute(file_path)) {
    //   if (workspace) {
    //     file_path = path.join(workspace, file_path);
    //   }
    // }
    if (fs.existsSync(file_path) && !fs.statSync(file_path).isFile()) {
      throw new Error(`File '${file_path}' is not a file.`);
    }
    if (fs.existsSync(file_path) && fs.statSync(file_path).isFile()) {
      if (await needReadFile(file_path, requestContext)) {
        throw new Error(
          `File '${file_path}' has been modified since last read. Please use 'Read' tool to read the file first and then use 'Write' tool to overwrite the file.`,
        );
      }
    }

    const dirPath = path.dirname(file_path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (mode === 'append') {
      await fs.promises.appendFile(file_path, content);
    } else {
      await fs.promises.writeFile(file_path, content);
    }

    await updateFileModTime(file_path, requestContext);

    return `The file was successfully written and saved in:\n<file>${file_path.replaceAll('\\', '/')}</file>`;
  };
}
