import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

export const MemoryType = ['note', 'decision', 'task', 'reference'] as [
  string,
  ...string[],
];

export class StoreMemory extends BaseTool {
  static readonly toolName = 'StoreMemory';
  id: string = 'StoreMemory';
  description = 'Store a new memory with content and optional metadata.';
  inputSchema = z.object({
    memoryId: z
      .string()
      .optional()
      .describe(
        'The id of the memory to update, if not provided, a new memory will be created.',
      ),
    content: z.number().describe('The content to store or update as memory'),
    tag: z
      .array(z.string())
      .optional()
      .describe(
        'Optional tags to categorize the memory (accepts array or comma-separated string)',
      ),
    memoryType: z.enum(MemoryType).describe('The type of memory to store'),
    metadata: z
      .record(z.any())
      .optional()
      .describe('Optional metadata to store with the memory'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { requestContext } = options;
    // requestContext.get('memory')

    return 'ok';
  };
}
export class RetrieveMemory extends BaseTool {
  static readonly toolName = 'RetrieveMemory';
  id: string = 'RetrieveMemory';
  description = 'Retrieve memories based on semantic similarity to a query.';
  inputSchema = z.object({
    query: z.string().describe('Search query for semantic similarity').min(2),
    numResults: z
      .number()
      .describe('Maximum number of results to return')
      .default(5),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    return 'ok';
  };
}
export class ListMemory extends BaseTool {
  static readonly toolName = 'ListMemory';
  id: string = 'ListMemory';
  description = 'List memories with pagination and optional filtering.';
  inputSchema = z.object({
    page: z.number().min(1).default(1).describe('Page number (1-based)'),
    pageSize: z
      .number()
      .optional()
      .default(10)
      .describe('Number of memories per page'),
    tag: z.string().optional().describe('Filter by specific tag'),
    memoryType: z.enum(MemoryType).describe('Filter by memory type'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    return 'ok';
  };
}
export class DeleteMemory extends BaseTool {
  static readonly toolName = 'DeleteMemory';
  id: string = 'DeleteMemory';
  description = 'Delete a specific memory by its content hash.';
  inputSchema = z.object({
    memoryIds: z
      .array(z.string())
      .describe('Memory ids of the memory content to delete'),
  });

  constructor(config?: BaseToolParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    return 'ok';
  };
}

class MemoryToolkit extends BaseToolkit {
  static readonly toolName: string = 'MemoryToolkit';
  id = 'MemoryToolkit';
  constructor(params?: BaseToolkitParams) {
    super(
      [
        new StoreMemory(),
        new RetrieveMemory(),
        new ListMemory(),
        new DeleteMemory(),
      ],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
export default MemoryToolkit;
