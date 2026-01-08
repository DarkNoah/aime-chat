import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import fg from 'fast-glob';
import { appManager } from '@/main/app';
import { ToolTags } from '@/types/tool';

const getSitecustomizePy = async () => {
  const appInfo = await appManager.getInfo();
  const mcpServerUrl = `http://localhost:${appInfo.apiServer.port}/mcp`;
  return `
import asyncio
import builtins
from mcp import ClientSession, StdioServerParameters
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import PromptReference, ResourceTemplateReference


MCP_SERVER_URL = "${mcpServerUrl}"

async def _list_tools_async() -> list[str]:
    async with streamablehttp_client(MCP_SERVER_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.list_tools()
            return [tool.name for tool in result.tools]

async def _call_tool_async(name: str, **kwargs):
    async with streamablehttp_client(MCP_SERVER_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(name, kwargs)
            texts = [c.text for c in result.content if c.type == 'text']
            return '\\n'.join(texts)

def _make_async_tool_func(name: str):
    async def _wrapper(**kwargs):
        return await _call_tool_async(name, **kwargs)
    return _wrapper


def _init_mcp_tools():
    tool_names = asyncio.run(_list_tools_async())
    for name in tool_names:
        setattr(builtins, name, _make_async_tool_func(name))


_init_mcp_tools()

`;
};

export class CodeExecution extends BaseTool {
  static readonly toolName = 'CodeExecution';
  id: string = 'CodeExecution';
  description = `Execute Python code. using uv runtime.
The code will be executed with Python 3.10.

Usage:
- every time will run in a new temporary directory, which is deleted after the run is completed.
- packages need to be reinstalled for every run if you need.

PTC Mode:
Programmatic Tool Calling (PTC) allows to write code that calls tools programmatically within the Code Execution environment, rather than requiring round-trips through the model for each tool invocation
- You can use all tools in the current context.
- You know tool names and descriptions and arguments in current context.

<tips>
- All returns will be returned as text.
- According to the tool description, if the returned format is a JSON or a JSON array and you need to use it, please use json.loads(result) to obtain the correct JSON object.
- All tool is async, so you need to use await to call the tool.
- There is no need to import the module for that function, because I have already loaded the function globally. You can use it directly.
- if you need to return some information, please use print(result) to return the result.
</tips>

<example>
available tools: [Bash, RemoveBackground, ...]
user: "Please remove the background from the image, find all .jpg in /path/to/images", and save in /path/to/images_removed_bg
assistant:
import asyncio
import glob
import os
async def main():
    images = glob.glob('/path/to/images/**/*.jpg', recursive=True)
    for image_path in images:
        result_text = await RemoveBackground(url_or_file_path = image_path, save_path = "/path/to/images_removed_bg/" + os.path.basename(image_path).replace('.jpg', '_removed.jpg')))
        result = json.loads(result_text)
    print('done')
asyncio.run(main())
</example>
`;
  inputSchema = z.object({
    code: z.string().describe('The code to execute'),
    packages: z
      .array(z.string())
      .optional()
      .describe('Optional: install python packages (eg: pandas, numpy)'),
    ptc: z
      .boolean()
      .optional()
      .default(true)
      .describe('Optional: use ptc mode (default: true)'),
    // language: z.enum(['nodejs', 'python']).describe('The language of the code'),
  });

  tags = [ToolTags.CODE];

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { code, packages = [], ptc } = inputData;
    const temp = app.getPath('temp');
    const tempDir = path.join(temp, nanoid());
    await fs.promises.mkdir(tempDir, { recursive: true });
    const isWindows = process.platform === 'win32';
    const uvPreCommand = isWindows ? 'uv.exe' : './uv';
    try {
      const uvRuntime = await getUVRuntime();
      if (uvRuntime.status !== 'installed') {
        throw new Error('UV runtime is not installed');
      }


      let resultInit = await runCommand(
        `${uvPreCommand} init "${tempDir}" && ${uvPreCommand} venv "${path.join(tempDir, '.venv')}"`,
        {
          cwd: uvRuntime?.dir,
        },
      );




      if (resultInit.code !== 0) {
        throw new Error(
          `Failed to initialize UV project: ${resultInit.stderr}`,
        );
      }

      if (ptc && !packages.includes('mcp')) packages.push('mcp');
      if (packages.length > 0) {
        const result = await runCommand(
          `${uvPreCommand} add ${packages.join(' ')} --project "${tempDir}"`,
          {
            cwd: uvRuntime?.dir,
          },
        );
        console.log(result);
        if (result.code !== 0) {
          throw new Error(`Failed to add packages: ${result.stderr}`);
        }
      }
      if (ptc) {
        let site_packages_path;
        if(isWindows)
          {
            site_packages_path = path.posix.join(
              tempDir.replace(/\\/g, '/'),
              '.venv',
              'lib',
              '**',
              'site-packages',
            );
        } else{
          site_packages_path = path.join(
            tempDir,
            '.venv',
            'lib',
            'python*',
            'site-packages',
          );
        }
        const sitePackages = await fg(site_packages_path, {
          onlyDirectories: true,
          caseSensitiveMatch:false,
        });
        if (sitePackages.length !== 1) {
          throw new Error('Site packages path not found or not unique');
        }
        site_packages_path = sitePackages[0];

        const sitecustomize_py = await getSitecustomizePy();
        await fs.promises.writeFile(
          path.join(site_packages_path, 'sitecustomize.py'),
          sitecustomize_py,
        );
      }

      const tempFile = path.join(tempDir, 'main.py');
      await fs.promises.writeFile(tempFile, code);

      const result = await runCommand(
        `${uvPreCommand} run --project "${tempDir}" "${tempFile}"`,
        {
          cwd: uvRuntime?.dir,
        },
      );
      return [
        `Directory: ${tempDir || '(root)'}`,
        `Stdout: \n${result.stdout || '(empty)'}`,
        `Stderr: \n${result.stderr || '(empty)'}`,
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
