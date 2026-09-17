import { ToolType } from '@/types/tool';
import BaseTool, { BaseToolParams } from '../base-tool';
import z from 'zod';
import type { ToolExecutionContext } from '@mastra/core/tools' with {
  'resolution-mode': 'import',
};
// Runtime manager also registers built-in tools.
// eslint-disable-next-line import/no-cycle
import { appManager } from '@/main/app';
import { executeBrowserCommands } from '@/main/browser/automation';

export interface AgentBrowserParams extends BaseToolParams {}

export class AgentBrowser extends BaseTool<AgentBrowserParams> {
  static readonly toolName = 'AgentBrowser';

  id = 'AgentBrowser';

  description = `Control this chat thread's browser tabs inside the Electron preview using agent-browser commands.
All threads share cookies and login state. Each thread owns its tabs and actions.
Use "tab list", "tab new <url>", "tab <tabId>", and "tab close <tabId>" to manage this thread's tabs.
Pass tabId to target a specific tab. Otherwise the thread's automation tab is used, independent of the tab the user is viewing.
Element refs are local to each tab. Take a new snapshot after navigation. Use this tool for browser automation, including when following the agent-browser skill.
Do not pass connection/session/profile flags. "close" closes only this thread's tabs. Commands may be joined with &&.`;

  inputSchema = z
    .object({
      command: z
        .string()
        .describe(
          'Browser command, e.g. agent-browser open https://example.com or snapshot -i',
        ),
      tabId: z
        .string()
        .optional()
        .describe(
          'A tab ID returned by tab list/new, owned by this chat thread.',
        ),
      description: z
        .string()
        .optional()
        .describe('Concise description of the action.'),
    })
    .strict();

  execute = async (
    input: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    const requestContext = options?.requestContext;
    const threadId = requestContext?.get('threadId' as never) as string;
    if (!threadId)
      throw new Error(
        'AgentBrowser requires a chat thread. Run it from a conversation.',
      );
    const skills =
      (requestContext?.get('skillsLoaded' as never) as string[]) || [];
    if (!skills.includes(`${ToolType.SKILL}:local:agent-browser`))
      return `You need to read ${ToolType.SKILL}:local:agent-browser skill first.`;
    let runtime = await appManager.getRuntimeInfo();
    if (!runtime.agentBrowser?.installed) {
      await appManager.installRuntime('agentBrowser');
      runtime = await appManager.getRuntimeInfo(true);
    }
    if (!runtime.agentBrowser?.installed)
      throw new Error('Agent Browser installation failed.');
    return executeBrowserCommands({
      threadId,
      command: input.command,
      tabId: input.tabId,
      workspace: requestContext?.get('workspace' as never) as string,
      signal: options?.abortSignal,
    });
  };
}
