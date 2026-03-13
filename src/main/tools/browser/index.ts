import { ToolConfig, ToolType } from "@/types/tool";
import BaseTool, { BaseToolParams } from "../base-tool";
import z from "zod";
import { ToolExecutionContext } from "@mastra/core/tools";
import { runCommand } from "@/main/utils/shell";
import { instancesManager } from "@/main/instances";

export interface AgentBrowserParams extends BaseToolParams {

}
export class AgentBrowser extends BaseTool<BaseToolParams> {
  static readonly toolName = 'AgentBrowser';

  id: string = 'AgentBrowser';
  description = `Control the browser`;
  inputSchema = z
    .object({
      command: z.string().describe('The command to execute'),
      description: z.string().optional().describe('Clear, concise description of what this command does in -10 words.'),
    })
    .strict();

  // onfigSchema = ToolConfig.WebFetch.configSchema;

  constructor(config?: AgentBrowserParams) {
    super(config);
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    options?: ToolExecutionContext,
  ) => {
    let { command } = inputData;
    const config = this.config;
    const { requestContext } = options ?? {};
    const workspace = requestContext?.get('workspace' as never) as string;
    const skillsLoaded = requestContext?.get('skillsLoaded' as never) as string[] || [];
    if (!skillsLoaded.includes(`${ToolType.SKILL}:local:agent-browser`) && requestContext?.size() > 0) {
      return `You need to read agent-browser skill first.`;
    }

    if (!command.startsWith('agent-browser')) {
      command = `agent-browser ${command}`;
      // throw new Error('Invalid command must start with "agent-browser <command>"');
    }
    const instances = await instancesManager.getInstances();
    const defaultInstance = instances?.find(x => x.status == 'running' && x.id == instancesManager.DEFAULT_BROWSER_INSTANCE_ID);
    if (!defaultInstance) {
      const result = await instancesManager.runInstance(instancesManager.DEFAULT_BROWSER_INSTANCE_ID);
      if (result.status !== 'running') {
        throw new Error('Failed to run default browser instance');
      }
    }

    const result = await runCommand(command, {
      abortSignal: options?.abortSignal,
      cwd: workspace,
      env: {
        AGENT_BROWSER_SESSION: "dev1"
      }
    });
    if (result.processSignal) {
      return 'Action cancelled by user';
    }
    if (result.code != 0) {

    }

    return result?.output ?? `Result not found, code: ${result?.code}, error: ${result?.stderr}`;
  };
}
