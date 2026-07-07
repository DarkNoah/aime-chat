import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { runCommand } from '@/main/utils/shell';
import { getUVRuntime } from '@/main/app/runtime';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import fg from 'fast-glob';
import { appManager } from '@/main/app';
import { secretsManager } from '@/main/app/secrets';
import { ToolConfig, ToolTags } from '@/types/tool';
import { getDataPath } from '@/main/utils';
import mastraManager from '@/main/mastra';
import { getRuntimePython } from '@/main/utils/runtimePython';
import { ProgressEvent, ProgressThreadEndedData } from '@/types/common';
import { getEnv } from '@/main/utils/getEnv';

const getSitecustomizePy = async (allRequestContext: Record<string, any> = {}, modelId?: string) => {
  const appInfo = await appManager.getInfo();
  const mcpServerUrl = `http://localhost:${appInfo.apiServer.port}/mcp`;
  const workspace = allRequestContext['workspace'] as string;
  const model = modelId ?? allRequestContext['model'] as string;
  const threadId = allRequestContext['threadId'] as string;
  let meta = {};
  if (workspace) {
    meta['workspace'] = workspace
  }
  if (model) {
    meta['model'] = model
  }
  if (threadId) {
    meta['threadId'] = threadId
  }



  return `
import asyncio
import builtins
import threading
from mcp import ClientSession, StdioServerParameters
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import PromptReference, ResourceTemplateReference


MCP_SERVER_URL = "${mcpServerUrl}"
_META = ${JSON.stringify(meta)}


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
            result = await session.call_tool(name, kwargs, meta=_META)
            texts = [c.text for c in result.content if c.type == 'text']
            return '\\n'.join(texts)


# A lazily-created background event loop running on its own thread. This lets a
# tool be invoked synchronously (e.g. \`ListVoices()\`) without an explicit
# \`await\` / \`asyncio.run(...)\`, and without interfering with any event loop the
# user's own code may already be running.
_bg_loop = None
_bg_lock = threading.Lock()


def _run_sync(coro):
    global _bg_loop
    with _bg_lock:
        if _bg_loop is None:
            _bg_loop = asyncio.new_event_loop()
            threading.Thread(target=_bg_loop.run_forever, daemon=True).start()
    return asyncio.run_coroutine_threadsafe(coro, _bg_loop).result()


class _AwaitableStr(str):
    """A str result that can also be awaited.

    This lets a tool be called either way:
        result = ListVoices()
        result = await ListVoices()
    """

    def __await__(self):
        return self.__resolved()

    def __resolved(self):
        return self
        yield  # pragma: no cover - turns this into a generator


def _make_tool_func(name: str):
    def _wrapper(**kwargs):
        return _AwaitableStr(_run_sync(_call_tool_async(name, **kwargs)))
    return _wrapper


def _init_mcp_tools():
    tool_names = asyncio.run(_list_tools_async())
    for name in tool_names:
        setattr(builtins, name, _make_tool_func(name))


_init_mcp_tools()

`;
};
export interface CodeExecutionParams extends BaseToolParams {
  ptcOpen?: boolean;
  modelId?: string;
}
export class CodeExecution extends BaseTool {
  static readonly toolName = 'CodeExecution';
  id: string = 'CodeExecution';
  description = `Execute Python code. using uv runtime.
The code will be executed with Python 3.10.

Note:
- Each run is executed in a new temporary directory, which is automatically deleted after completion.
- Any required packages must be specified in the packages parameter, as dependencies are not persisted between runs.
- If Python reports a missing module, do not install it using pip via the Bash tool. Instead, add the required dependency to the packages parameter.

`;
  inputSchema = z.object({
    code: z.string().describe('The code to execute'),
    packages: z
      .array(z.string())
      .optional()
      .describe('Optional: list all non-standard-library Python dependencies used by the code. Packages must be specified for each run because they are not persisted. Example: pandas, numpy'),
    ptc: z
      .boolean()
      .optional()
      .default(true)
      .describe('Optional: use ptc mode (default: true)'),
    // language: z.enum(['nodejs', 'python']).describe('The language of the code'),
  });

  tags = [ToolTags.CODE];
  configSchema = ToolConfig.CodeExecution.configSchema;
  ptcOpen: boolean = false;
  modelId?: string;

  constructor(config?: CodeExecutionParams) {
    super(config);
    const apiServerStatus = mastraManager.httpServer?.listening
    this.ptcOpen = config?.ptcOpen ?? apiServerStatus ?? true;
    this.modelId = config?.modelId;
    this.description = this.getDescription();
  }

  getDescription = () => {
    const desc = `Execute Python code. using uv runtime.
The code will be executed with Python 3.10.

Note:
- Each run is executed in a new temporary directory, which is automatically deleted after completion.
- Any required packages must be specified in the packages parameter, as dependencies are not persisted between runs.
- If Python reports a missing module, do not install it using pip via the Bash tool. Instead, add the required dependency to the packages parameter.`;
    if (this.ptcOpen) {
      return (
        desc +
        `
PTC Mode:
Programmatic Tool Calling (PTC) allows to write code that calls tools programmatically within the Code Execution environment, rather than requiring round-trips through the model for each tool invocation
- You can use all tools in the current context.
- You know tool names and descriptions and arguments in current context.

<tips>
- All returns will be returned as text.
- According to the tool description, if the returned format is a JSON or a JSON array and you need to use it, please use json.loads(result) to obtain the correct JSON object.
- All tool is async, so you need to use await to call the tool.
- There is no need to import the module for that function, because I have already loaded the function globally. You can use it directly.
- If you need to return some information, please use print(result) to return the result.
- Handle errors gracefully.
- If there is a large amount of input data, it is best to retrieve values through variables in code rather than hard-coding them directly.
  <bad-example>
  \`\`\`py
  paths = ['xxx.py' , 'yyy.py' , 'zzz.py']
  \`\`\`
  </bad-example>
  <good-example>
  \`\`\`py
  paths = glob.glob('**/*.py', recursive=True)
  \`\`\`
  </good-example>
</tips>

<ChatCompletion>
ChatCompletion is a special built-in tool that calls the Chat (LLM) interface directly. It is NOT listed in the available tools list, but you can always call it in PTC mode like any other globally injected async function.
Use it when you need the model to reason over / transform / summarize data inside your code loop (e.g. per row, per cell, per file).
- It is async, call it with \`await ChatCompletion(...)\`.
- It returns the assistant reply as plain text.
- More details, please check skill:local:aime-chat-docs to view the documentation.
Input parameters:
- messages (required): either a plain string (treated as a single user message), or a list of message objects like [{"role": "user" | "assistant", "content": "..."}].
- instructions (optional): a system prompt string that defines the assistant's behavior/role. Defaults to "You are a helpful assistant.".
<good-example>
\`\`\`py
reply = await ChatCompletion(instructions="You are a translator, translate to English.", messages="你好")
\`\`\`
</good-example>
</ChatCompletion>

<example>
available tools: [Bash, RemoveBackground, Message, ...]
user: "Please remove the background from the image, find all .jpg in /path/to/images", and save in /path/to/images_removed_bg
assistant:
import asyncio
import glob
import os
import json
async def main():
    images = glob.glob('/path/to/images/**/*.jpg', recursive=True)
    total = len(images)
    # Report progress so the user can track this long-running loop in the task manager.
    await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "start", "title": "Removing background", "message": f"{total} images", "percent": 0}))
    for index, image_path in enumerate(images):
        result_text = await RemoveBackground(url_or_file_path = image_path, save_path = "/path/to/images_removed_bg/" + os.path.basename(image_path).replace('.jpg', '_removed.jpg'))
        result = json.loads(result_text)
        # Reuse the same "id" so each update replaces the previous progress state.
        await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "update", "message": os.path.basename(image_path), "percent": round((index + 1) / total * 100)}))
    await Message(event="progress", data=json.dumps({"id": "remove-bg", "type": "end", "message": "All images processed", "percent": 100}))
    print('done')
asyncio.run(main())
</example>

<example>
available tools: [Message]
user: "Read /path/to/data.xlsx, for each non-empty cell in column A, send it to ChatCompletion and write the reply into column B of the same row."
assistant:
import asyncio
import json
import openpyxl
async def main():
    file_path = '/path/to/data.xlsx'
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active
    # Collect non-empty cells in column A first so we can compute progress percent.
    cells = [cell for cell in ws['A'] if cell.value is not None and str(cell.value).strip() != '']
    total = len(cells)
    await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "start", "title": "Filling column B", "message": f"{total} rows", "percent": 0}))
    for index, cell in enumerate(cells):
        try:
            reply = await ChatCompletion(
                instructions="You are a helpful assistant.",
                messages=str(cell.value),
            )
        except Exception as e:
            reply = "ERROR: " + str(e)
        # Write the reply into the adjacent column B of the same row.
        ws.cell(row=cell.row, column=cell.column + 1, value=reply)
        # Reuse the same "id" so progress updates in place instead of stacking.
        await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "update", "message": f"Row {cell.row}", "percent": round((index + 1) / total * 100)}))
    wb.save(file_path)
    await Message(event="progress", data=json.dumps({"id": "fill-column-b", "type": "end", "message": "Saved " + file_path, "percent": 100}))
    print('done, processed file: ' + file_path)
asyncio.run(main())
</example>
`
      );
    }
    return desc;
  };


  isLockError = (stderr = '', code?: number) => {
    const s = String(stderr).toLowerCase();
    return (
      s.includes('os error 1224') ||
      s.includes('user mapped') ||
      s.includes('请求的操作无法在使用用户映射区域打开的文件上执行') ||
      s.includes('access is denied') ||
      s.includes('the process cannot access the file')
    );
  }

  runWithRetry = async (
    fn: () => Promise<{ code: number; stdout?: string; stderr?: string }>,
    retries = 4,
  ): Promise<any> => {
    let last: any;
    for (let i = 0; i < retries; i++) {
      const r = await fn();
      if (r.code === 0) return r;

      last = r;
      if (!this.isLockError(r.stderr, r.code)) return r;

      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
    return last;
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const { code, packages = [], ptc } = inputData;
    const { requestContext, abortSignal } = options;

    const temp = getDataPath('temp')
    const tempDir = path.join(temp, nanoid());
    await fs.promises.mkdir(tempDir, { recursive: true });
    const isWindows = process.platform === 'win32';
    const uvRuntime = await getUVRuntime();
    if (uvRuntime.status !== 'installed') {
      throw new Error('UV runtime is not installed');
    }

    const uvPreCommand = path.join(uvRuntime.dir, isWindows ? 'uv.exe' : 'uv');

    const workspace = (requestContext.get('workspace' as never) as string) || tempDir;
    const allRequestContext = requestContext.all

    try {



      let installPackage = ''
      if (ptc && !packages.includes('mcp')) packages.push('mcp');
      if (packages.length > 0) {
        installPackage = ` && "${uvPreCommand}" add ${packages.join(' ')}`
      }
      const env = await getRuntimePython();
      let resultInit = await this.runWithRetry(() => runCommand(
        `"${uvPreCommand}" init && "${uvPreCommand}" --no-cache  venv --seed --default-index https://mirrors.aliyun.com/pypi/simple/`,
        {
          cwd: tempDir,
          env: env,
          abortSignal: abortSignal
        },
      ));

      if (resultInit.code !== 0) {
        throw new Error(
          `Failed to initialize UV project: ${resultInit.stderr}`,
        );
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * 2));

      if (packages.length > 0) {
        const resultInstall = await this.runWithRetry(() => runCommand(
          `"${uvPreCommand}" --no-cache pip install ${packages.join(' ')} --default-index https://mirrors.aliyun.com/pypi/simple/`,
          {
            cwd: tempDir,
            env: env,
            abortSignal: abortSignal
          },
        ));
        if (resultInstall.code !== 0) {
          throw new Error(`Failed to install packages: ${resultInstall.stderr}`);
        }
      }






      if (ptc) {
        let site_packages_path;
        if (isWindows) {
          site_packages_path = path.posix.join(
            tempDir.replace(/\\/g, '/'),
            '.venv',
            'lib',
            '**',
            'site-packages',
          );
        } else {
          site_packages_path = path.join(
            tempDir,
            '.venv',
            'lib',
            'python*',
            'site-packages',
          );
        }
        const sitePackages = await fg(site_packages_path.replace(/\\/g, '/'), {
          onlyDirectories: true,
          caseSensitiveMatch: false,
        });
        if (sitePackages.length !== 1) {
          throw new Error('Site packages path not found or not unique');
        }
        site_packages_path = sitePackages[0];

        const sitecustomize_py = await getSitecustomizePy(allRequestContext, this.modelId);
        await fs.promises.writeFile(
          path.join(site_packages_path, 'sitecustomize.py'),
          sitecustomize_py,
        );
      }

      const tempFile = path.join(tempDir, 'main.py');
      await fs.promises.writeFile(tempFile, code);

      const secretsEnv = await getEnv(requestContext);
      const _env = { ...env, ...secretsEnv };
      const result = await runCommand(
        `"${uvPreCommand}" run --project "${tempDir}" "${tempFile}"`,
        {
          cwd: workspace,
          env: _env,
          abortSignal: abortSignal
        },

      );

      const MAX_OUTPUT_LINES = 2000;
      const truncateLines = (text: string, maxLines: number): string => {
        const lines = text.split('\n');
        if (lines.length <= maxLines) return text;
        const headCount = Math.floor(maxLines / 2);
        const tailCount = maxLines - headCount;
        const omitted = lines.length - maxLines;
        const head = lines.slice(0, headCount).join('\n');
        const tail = lines.slice(-tailCount).join('\n');
        return `${head}\n...[truncated ${omitted} lines, total ${lines.length} lines]...\n${tail}`;
      };

      return [
        `Directory: ${workspace || '(root)'}`,
        `Stdout: \n${result.stdout ? truncateLines(result.stdout, MAX_OUTPUT_LINES) : '(empty)'}`,
        `Stderr: \n${result.stderr ? truncateLines(result.stderr, MAX_OUTPUT_LINES) : '(empty)'}`,
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
      // 执行结束（包括正常结束、中断或失败）时，结束该线程下仍在进行中的进度 UI。
      const threadId = requestContext.get('threadId' as never) as
        | string
        | undefined;
      await appManager.sendEvent(ProgressEvent.ProgressThreadEnded, {
        threadId,
      } satisfies ProgressThreadEndedData);
      await fs.promises.rm(tempDir, { recursive: true });
    }
  };
}
