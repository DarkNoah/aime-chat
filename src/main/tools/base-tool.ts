import { Mastra } from '@mastra/core';

import {
  createTool,
  Tool,
  ToolAction,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { tool, ToolCallOptions } from 'ai';
import z, { ZodSchema, ZodObject, ZodTypeAny } from 'zod';
import { LanguageModelV2ToolResultPart } from '@ai-sdk/provider';
export interface BaseToolParams {
  description?: string;
  verbose?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

abstract class BaseTool<
  T extends BaseToolParams = BaseToolParams,
> implements Tool<
  ZodSchema,
  ZodSchema,
  any,
  any,
  ToolExecutionContext<ZodSchema, any>
> {
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
  config?: T;

  format?: 'mastra' | 'ai-sdk';

  inputExample?: string | string[];
  returnExample?: string | string[];

  constructor(config?: T) {
    this.config = config;
  }

  execute?: ToolAction<ZodSchema>['execute'];
  toModelOutput?: (output: any) => LanguageModelV2ToolResultPart['output'];
  mastra?: Mastra;
  requireApproval?: boolean;

  onOutput?: (
    options: {
      output: any;
      toolName: string;
    } & Omit<ToolCallOptions, 'messages'>,
  ) => void | PromiseLike<void>;
}
export default BaseTool;
