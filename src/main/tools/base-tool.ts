import { Mastra } from '@mastra/core';

import {
  MastraToolInvocationOptions,
  Tool,
  ToolAction,
  ToolExecutionContext,
} from '@mastra/core/tools';
import z, { ZodSchema, ZodObject, ZodTypeAny } from 'zod';

abstract class BaseTool
  implements
    Tool<
      ZodSchema,
      ZodSchema,
      any,
      any,
      ToolExecutionContext<ZodSchema, any, any>
    >
{
  abstract id: string;
  description: string;
  abstract inputSchema: ZodSchema;
  outputSchema?: ZodSchema;
  suspendSchema?: any;
  resumeSchema?: any;

  constructor() {}
  execute?: ToolAction<ZodSchema>['execute'];
  mastra?: Mastra;
  requireApproval?: boolean;
}
export default BaseTool;
