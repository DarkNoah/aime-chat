import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import z from 'zod';
import BaseTool from '../base-tool';
import fs from 'fs';
import path from 'path';
import { needReadFile, updateFileModTime } from '.';

export class Write extends BaseTool {
  static readonly toolName = 'Write';
  id: string = 'Write';
  description: string = `Writes a file to the local filesystem, overwriting if one exists.

When to use: creating a new file, or fully replacing one you've already Read. Overwriting an existing file you haven't Read will fail. For partial changes, use Edit instead.`;
  inputSchema = z
    .object({
      file_path: z
        .string()
        .describe(
          'The absolute path to the file to write (must be absolute, not relative)',
        ),
      content: z.string().describe('The content to write to the file'),
      mode: z.enum(['append', 'overwrite']).optional().default('overwrite'),
    })
    .strict();
  outputSchema = z.string();
  // requireApproval: true,
  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    let { file_path, content, mode = 'overwrite' } = inputData;
    const { requestContext } = context;
    // const workspace = config?.configurable?.workspace;

    // if (!path.isAbsolute(file_path)) {
    //   if (workspace) {
    //     file_path = path.join(workspace, file_path);
    //   }
    // }
    if (fs.existsSync(file_path) && !fs.statSync(file_path).isFile()) {
      throw new Error(`File '${file_path}' is not a file.`);
    }
    if (fs.existsSync(file_path) && fs.statSync(file_path).isFile()) {
      if (await needReadFile(file_path, requestContext)) {
        throw new Error(
          `File '${file_path}' has been modified since last read. Please use 'Read' tool to read the file first and then use 'Write' tool to overwrite the file.`,
        );
      }
    }

    const dirPath = path.dirname(file_path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    if (mode === 'append') {
      await fs.promises.appendFile(file_path, content);
    } else {
      await fs.promises.writeFile(file_path, content);
    }

    await updateFileModTime(file_path, requestContext);

    return `The file was successfully written and saved in:\n<file>${file_path.replaceAll('\\', '/')}</file>`;
  };
}
