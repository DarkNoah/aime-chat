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
  description = `Run Python code with UV runtime
Usage:
- Each execution environment runs code in a new system temporary directory, which is deleted after the run is completed.
- Packages need to be reinstalled for every run if you need.
`;
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

    try {
      const uvRuntime = await getUVRuntime();
      if (uvRuntime.status !== 'installed') {
        throw new Error('UV runtime is not installed');
      }

      const tempFile = path.join(tempDir, nanoid() + '.py');
      const file = await fs.promises.writeFile(tempFile, code);
      const resultInit = await runCommand(
        `uv init ${tempDir}`,
        uvRuntime?.dir,
        undefined,
      );
      console.log(resultInit);
      if (resultInit.code !== 0) {
        throw new Error(
          `Failed to initialize UV project: ${resultInit.stderr}`,
        );
      }
      if (packages && packages.length > 0) {
        const result = await runCommand(
          `uv add ${packages.join(' ')} --project ${tempDir}`,
          uvRuntime?.dir,
          undefined,
        );
        console.log(result);
        if (result.code !== 0) {
          throw new Error(`Failed to add packages: ${result.stderr}`);
        }
      }
      const result = await runCommand(
        `uv run ${tempFile}`,
        uvRuntime?.dir,
        undefined,
      );
      return [
        `Directory: ${tempDir || '(root)'}`,
        `Stdout: ${result.stdout || '(empty)'}`,
        `Stderr: ${result.stderr || '(empty)'}`,
        `Error: ${result.error ?? '(none)'}`,
        `Exit Code: ${result.code ?? '(none)'}`,
        `Signal: ${result.processSignal ?? '(none)'}`,
        // `Background PIDs: ${
        //   backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'
        // }`,
        `Process Group PGID: ${result.pid ?? '(none)'}`,
      ].join('\n');
    } catch (error) {
      throw error;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true });
    }
  };
}
