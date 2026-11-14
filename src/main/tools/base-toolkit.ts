import { ZodSchema } from 'zod';
import BaseTool from './base-tool';

export interface BaseToolkitParams { }

abstract class BaseToolkit {
  static readonly toolName: string = 'BaseToolkit';
  abstract id: string;
  description: string;
  tools: BaseTool[];
  isToolkit: boolean = true;

  /** Display in the connectors tab while keeping built-in tool behavior. */
  fakeMcp: boolean = false;

  tags?: string[];
  doc?: string;
  configSchema?: ZodSchema;
  config?: BaseToolkitParams;
  isHidden?: boolean;

  constructor(tools: BaseTool[], config?: BaseToolkitParams) {
    this.tools = tools;
    this.config = config;
  }
}
export default BaseToolkit;
