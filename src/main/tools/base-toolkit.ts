import { ZodSchema } from 'zod';
import BaseTool from './base-tool';

export interface BaseToolkitParams {}

abstract class BaseToolkit {
  abstract id: string;
  description: string;
  tools: BaseTool[];
  isToolkit: boolean = true;
  tags?: string[];
  doc?: string;
  configSchema?: ZodSchema;
  config?: BaseToolkitParams;

  constructor(tools: BaseTool[], config?: BaseToolkitParams) {
    this.tools = tools;
    this.config = config;
  }
}
export default BaseToolkit;
