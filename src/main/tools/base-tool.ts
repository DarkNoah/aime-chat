import type { Mastra } from '@mastra/core' with { "resolution-mode": "import" };

import type {
  createTool,
  Tool,
  ToolAction,
  ToolExecutionContext,
} from '@mastra/core/tools' with { "resolution-mode": "import" };
import type { ToolCallOptions } from 'ai';
import type { ZodSchema } from 'zod';
import type { LanguageModelV2ToolResultPart } from '@ai-sdk/provider';
import type { PublicSchema } from '@mastra/core/schema' with { "resolution-mode": "import" };
export interface BaseToolParams {
  description?: string;
  verbose?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

abstract class BaseTool<
  T extends BaseToolParams = BaseToolParams,
> {
  static readonly toolName: string = 'BaseTool';
  abstract id: string;
  description: string;
  abstract inputSchema: PublicSchema<any>;
  isToolkit: boolean = false;
  outputSchema?: PublicSchema<any>;
  suspendSchema?: any;
  resumeSchema?: any;
  descriptionField?: string;
  doc?: string;
  tags?: string[];
  configSchema?: ZodSchema;
  config?: T;
  isHidden?: boolean;

  format?: 'mastra' | 'ai-sdk';

  inputExample?: string | string[];
  returnExample?: string | string[];

  constructor(config?: T) {
    this.config = config;
  }

  execute?: ToolAction<any, any, any, any, ToolExecutionContext<any, any>>['execute'];
  toModelOutput?: (output: any) => unknown;
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
