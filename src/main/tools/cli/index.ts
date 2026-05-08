import { ToolConfig, ToolType } from "@/types/tool";
import BaseTool, { BaseToolParams } from "../base-tool";
import z from "zod";
import { ToolExecutionContext } from "@mastra/core/tools";
import { runCommand } from "@/main/utils/shell";
import { instancesManager } from "@/main/instances";
import { appManager } from "@/main/app";
import { providersManager } from "@/main/providers";
import { agentManager } from "@/main/mastra/agents";
import { toolsManager } from "..";

export interface AimeChatCliParams extends BaseToolParams {

}
export class AimeChatCli extends BaseTool<BaseToolParams> {
  static readonly toolName = 'AimeChatCli';
  id: string = 'AimeChatCli';
  description = `

Commands:
'tools' : Get all tools information.
'embddings' : List embedding models.
'agents' : List agents.
`;
  inputSchema = z
    .object({
      command: z.string().describe('The command to execute'),
    })
    .strict();

  // onfigSchema = ToolConfig.WebFetch.configSchema;

  constructor(config?: AimeChatCliParams) {
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

    let output = '';
    if (command == 'tools') {
      const tools = await toolsManager.getAvailableTools({ isActive: true });
      for (const toolType of Object.keys(tools)) {
        output += `${toolType.toUpperCase()}:\n`;
        for (const tool of tools[toolType as ToolType]) {
          if (tool.isToolkit) {
            for (const subTool of tool.tools ?? []) {
              output += `- [${subTool.id}]: ${subTool.description}\n`;
            }
          } else {
            output += `- [${tool.id}]: ${tool.description}\n`;
          }
        }
        output += `\n`;
      }

      return output;
    }
    else if (command == 'embddings') {
      const providers = await providersManager.getAvailableEmbeddingModels();

      for (const provider of providers) {
        if (provider.models.length == 0) continue;
        output += `${provider.name}\n`;
        for (const embedding of provider.models) {
          output += `- [${embedding.id}]: ${embedding.name}\n`;
        }
        output += `\n`;
      }
      return output;
    }
    else if (command == 'agents') {
      const agents = await agentManager.getAvailableAgents();
      output += 'AVAILABLE AGENTS:\n';
      for (const agent of agents) {
        output += ` - [${agent.id}]: ${agent.description}\n`;
      }
      return output;
    }

  };
}
