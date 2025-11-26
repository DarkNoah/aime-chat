import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { createShell, runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';
import { truncateText } from '@/utils/common';
import os from 'os';
import stripAnsi from 'strip-ansi';
import { spawn } from 'child_process';
import { Glob } from './glob';
import { Bash } from './bash';
import { Edit, MultiEdit } from './edit';
import { Grep } from './grep';
import { Write } from './write';
import { Read } from './read';
import { RequestContext } from '@mastra/core/request-context';

export interface FileSystemParams extends BaseToolkitParams {}

export class FileSystem extends BaseToolkit {
  id: string = 'FileSystem';
  description = '测试工具';

  constructor(params?: FileSystemParams) {
    super(
      [new Glob(), new Edit(), new Grep(), new Write(), new Read()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}

export const needReadFile = async (
  file_path: string,
  requestContext: RequestContext,
): Promise<boolean> => {
  if (!requestContext) return false;
  const fileLastReadTime = requestContext.get(
    'file_last_read_time' as never,
  ) as Record<string, number>;
  if (!fileLastReadTime[file_path]) {
    return true;
  }
  const lastReadTime = fileLastReadTime[file_path];
  const state = await fs.promises.stat(file_path);

  if (state.mtimeMs > lastReadTime) {
    return true;
  }
  return false;
};

export const updateFileModTime = async (
  file_path: string,
  requestContext: RequestContext,
): Promise<void> => {
  if (!requestContext) return;
  const fileLastReadTime =
    (requestContext.get('file_last_read_time' as never) as Record<
      string,
      number
    >) ?? {};
  fileLastReadTime[file_path] = Date.now();
  requestContext.set('file_last_read_time' as never, fileLastReadTime as never);
};

export const formatCodeWithLineNumbers = ({
  content: codeContent,
  startLine: startingLine,
}) => {
  if (!codeContent) return '';

  const arr = codeContent.split(/\r?\n/).map((line, index) => {
    const lineNumber = index + startingLine;
    const lineNumberStr = String(lineNumber);
    return lineNumberStr.length;
  });
  const max = Math.max(...arr) > 6 ? Math.max(...arr) : 6;

  return codeContent
    .split(/\r?\n/)
    .map((line, index) => {
      const lineNumber = index + startingLine;
      const lineNumberStr = String(lineNumber);

      // Format line number with padding if needed
      // if (lineNumberStr.length >= 6) {
      //   return `${lineNumberStr}→${line}`;
      // }
      return `${lineNumberStr.padStart(max, ' ')}→${line}`;
    })
    .join('\n');
};
