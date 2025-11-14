import { Mastra } from '@mastra/core';
import {
  MastraToolInvocationOptions,
  Tool,
  ToolExecutionContext,
} from '@mastra/core/tools';

abstract class BaseTool implements Tool {
  abstract id: string;
  description: string;
  inputSchema?: undefined;
  outputSchema?: undefined;
  suspendSchema?: any;
  resumeSchema?: any;
  abstract execute?: (
    context: ToolExecutionContext<undefined, any, any>,
    options?: MastraToolInvocationOptions,
  ) => Promise<unknown>;
  mastra?: Mastra;
  requireApproval?: boolean;
}
export default BaseTool;
