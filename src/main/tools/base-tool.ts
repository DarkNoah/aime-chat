import { Mastra } from '@mastra/core';

import {
  createTool,
  MastraToolInvocationOptions,
  Tool,
  ToolAction,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { tool } from 'ai';
import z, { ZodSchema, ZodObject, ZodTypeAny } from 'zod';

export interface BaseToolParams {
  description?: string;
  verbose?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

abstract class BaseTool
  implements
    Tool<ZodSchema, ZodSchema, any, any, ToolExecutionContext<ZodSchema, any>>
{
  abstract id: string;
  description: string;
  abstract inputSchema: ZodSchema;
  isToolkit: boolean = false;
  outputSchema?: ZodSchema;
  suspendSchema?: any;
  resumeSchema?: any;

  descriptionField?: string;

  doc?: string;

  tags?: string[];

  configSchema?: ZodSchema;
  config?: BaseToolParams;

  constructor(config?: BaseToolParams) {
    this.config = config;
  }

  execute?: ToolAction<ZodSchema>['execute'];
  mastra?: Mastra;
  requireApproval?: boolean;

  // static build
}
export default BaseTool;
