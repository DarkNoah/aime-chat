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
import { ToolTags } from '@/types/tool';

export class NodejsExecute extends BaseTool {
  id: string = 'NodejsExecute';
  description = `Run node.js code
Usage:
- Each execution environment runs code in a new system temporary directory, which is deleted after the run is completed.
- Dependencies need to be reinstalled for every run if you need.`;
  inputSchema = z.object({
    code: z.string().describe('The node.js code to execute'),
    use_ts: z.boolean().optional().default(false).describe('Use TypeScript'),
    dependencies: z
      .array(z.string())
      .optional()
      .describe('Optional: install npm dependencies (eg: express, axios)'),
  });

  tags = [ToolTags.CODE];

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: MastraToolInvocationOptions,
  ) => {
    const { code, dependencies, use_ts } = inputData;
    const temp = app.getPath('temp');
    const tempDir = path.join(temp, nanoid());
    await fs.promises.mkdir(tempDir, { recursive: true });
    let tempFile;

    const uvRuntime = await getUVRuntime();

    let result;
    if (use_ts) {
      tempFile = path.join(tempDir, 'src', nanoid() + '.ts');
      result = await runCommand(
        `npm init -y && npm install typescript --save-dev && npx tsc --init && mkdir src`,
        {
          cwd: tempDir,
        },
      );
      await fs.promises.writeFile(tempFile, code);
      if (dependencies && dependencies.length > 0) {
        result = await runCommand(`npm install ${dependencies.join(' ')}`, {
          cwd: tempDir,
        });
      }

      result = await runCommand(`npx ts-node "${tempFile}"`, {
        cwd: tempDir,
      });
    } else {
      tempFile = path.join(tempDir, nanoid() + '.js');
      await fs.promises.writeFile(tempFile, code);
      if (dependencies && dependencies.length > 0) {
        result = await runCommand(`npm install ${dependencies.join(' ')}`, {
          cwd: tempDir,
        });
      }
      result = await runCommand(`node "${tempFile}"`, {
        cwd: tempDir,
      });
    }

    await fs.promises.rm(tempDir, { recursive: true });
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
  };
}
