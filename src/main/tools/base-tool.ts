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
  config?: BaseToolParams;

  constructor(config?: BaseToolParams) {
    this.config = config;
  }

  execute?: ToolAction<ZodSchema>['execute'];
  mastra?: Mastra;
  requireApproval?: boolean;

}
export default BaseTool;
