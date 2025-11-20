import { Agent } from '@mastra/core/agent';
import {
  createTool,
  MastraToolInvocationOptions,
  ToolExecutionContext,
} from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';

export class PythonExecute extends BaseTool {
  id: string = 'PythonExecute';
  description = 'Execute Python code';
  inputSchema = z.object({
    code: z.string().describe('The Python code to execute'),
    packages: z
      .array(z.string())
      .optional()
      .describe('Optional: install python packages (eg: pandas, numpy)'),
  });

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
  ) => {
    const { code, packages } = inputData;
    const temp = app.getPath('temp');
    const tempDir = path.join(temp, nanoid());
    await fs.promises.mkdir(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, temp, nanoid() + '.py');
    const file = await fs.promises.writeFile(tempFile, code);
    const uvRuntime = await getUVRuntime();
    if (packages && packages.length > 0) {
      const result = await runCommand(
        `uv add ${tempFile}`,
        uvRuntime?.dir,
        undefined,
      );
    }
    const result = await runCommand(
      `uv run ${tempFile}`,
      uvRuntime?.dir,
      undefined,
    );
    await fs.promises.rm(tempFile, { recursive: true });
    return result;
  };
}
