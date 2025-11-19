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



export interface FileSystemParams extends BaseToolkitParams {}

export class FileSystem extends BaseToolkit {
  id: string = 'FileSystem';
  description = '测试工具';

  constructor(params?: FileSystemParams) {
    super([new Bash(), new Glob()], params);
  }

  getTools() {
    return this.tools;
  }
}


