import { SubAgentInfo } from "@/types/task";
import BaseTool, { BaseToolParams } from "../base-tool";
import { ToolType } from "@/types/tool";
import { ToolExecutionContext } from "@mastra/core/tools";
import { agentManager } from "@/main/mastra/agents";
import { z } from 'zod';
import { appManager } from "@/main/app";
import { AgentExecutionOptions } from "@mastra/core/agent";
import mastraManager from "@/main/mastra";
import { getSubAgentThreadId } from "@/utils/subagent-thread";
import { OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import { nanoid } from '@/utils/nanoid';
import backgroundAgentManager from './background-agent';
import type { AgentSessionMessage, ChatRequestContext } from '@/types/chat';
import { providersManager } from '@/main/providers';
import { AskUserQuestion } from "./ask-user-question";
import { RequestContext } from "@mastra/core/request-context";

const formatAgentOutput = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return (
      JSON.stringify(
        value,
        (_key, item) => {
          if (typeof item === 'bigint') return item.toString();
          if (item instanceof Error) return item.message;
          return item;
        },
        2,
      ) ?? String(value)
    );
  } catch {
    return String(value);
  }
};

export interface AgentToolParams extends BaseToolParams {
  subAgents: SubAgentInfo[] | string[];
}

export class Agent extends BaseTool {
  static readonly toolName = 'Agent';
  id: string = 'Agent';
  description = `Launch a new agent to handle complex, multi-step tasks autonomously.

The Task tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
- general-purpose: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you. (Tools: *)
- Explore: Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions. (Tools: All tools)
- Plan: Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions. (Tools: All tools)

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above


Usage notes:
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
- Use the run_in_background parameter for long-running tasks when you do not need the result immediately. The user can follow every message in the background Agent panel, and you will be notified when the agent finishes or fails.
- A foreground agent returns one final message to you. A background completion or failure is injected into the parent conversation automatically. In either mode, send the user a concise summary of the outcome.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- Agents with "access to current context" can see the full conversation history before the tool call. When using these agents, you can write concise prompts that reference earlier context (e.g., "investigate the error discussed above") instead of repeating information. The agent will receive all prior messages and understand the context.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
- If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple Task tool use content blocks. For example, if you need to launch both a code-reviewer agent and a test-runner agent in parallel, send a single message with both tool calls.

Example usage:

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a signficant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the Task tool to launch the code-reviewer agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch the greeting-responder agent"
</example>
`;
  inputSchema = z.strictObject({
    description: z
      .string()
      .describe('A short (3-5 word) description of the task'),
    prompt: z.string().describe('The task for the agent to perform'),
    subagent_type: z
      .string()
      .describe('The type of specialized agent to use for this task'),
    run_in_background: z
      .boolean()
      .optional()
      .describe(
        'Set to true to run the agent in the background. You will be notified when it completes or fails.',
      ),
  });

  constructor(config?: AgentToolParams) {
    super(config);
    this.description = this.getDescription(config?.subAgents ?? []);
  }

  getDescription = (subAgents: SubAgentInfo[] | string[]) => {
    let _subAgents: SubAgentInfo[] = [];
    if (
      subAgents.length > 0 &&
      subAgents.every((subAgent) => typeof subAgent === 'string')
    ) {
      throw new Error('SubAgents must be an array of SubAgentInfo');
    } else {
      _subAgents = subAgents as SubAgentInfo[];
    }

    return `Launch a new agent to handle complex, multi-step tasks autonomously.

The Task tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
- general-purpose: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you. (Tools: *)
${_subAgents.map((subAgent) => `- ${subAgent.name}: ${subAgent.description} (Tools: ${subAgent.tools.map((tool) => (tool.startsWith(`${ToolType.BUILD_IN}:`) || tool.startsWith(`${ToolType.MCP}:`) ? tool.split(':').splice(1).join(':') : tool)).join(', ')})`).join('\n')}

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.

When NOT to use the Task tool:
- If you want to read a specific file path, use the Read or Glob tool instead of the Task tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the Glob tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the Read tool instead of the Task tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above


Usage notes:
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
- Use the run_in_background parameter for long-running tasks when you do not need the result immediately. The user can follow every message in the background Agent panel, and you will be notified when the agent finishes or fails.
- A foreground agent returns one final message to you. A background completion or failure is injected into the parent conversation automatically. In either mode, send the user a concise summary of the outcome.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- Agents with "access to current context" can see the full conversation history before the tool call. When using these agents, you can write concise prompts that reference earlier context (e.g., "investigate the error discussed above") instead of repeating information. The agent will receive all prior messages and understand the context.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
- If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple Task tool use content blocks. For example, if you need to launch both a code-reviewer agent and a test-runner agent in parallel, send a single message with both tool calls.

Example usage:

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a signficant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the Task tool to launch the code-reviewer agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch the greeting-responder agent"
</example>
`;
  };

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    let { description, prompt, subagent_type } = inputData;
    const storage = mastraManager.mastra.getStorage();
    const memory = await storage.getStore('memory');

    const {
      writer,
      abortSignal,
      requestContext,
      agent: agentContext,
    } = context;
    const toolCallId = agentContext.toolCallId || nanoid(8);
    const rootAgentModel = requestContext.get('model' as never) as string;
    const rootAgentId = requestContext.get('agentId' as never) as string;
    const rootThreadId = requestContext.get('threadId' as never) as string;
    const rootResourceId = requestContext.get('resourceId' as never) as string;
    let rootAgentTools = requestContext.get('tools' as never) as string[] ?? [];

    rootAgentTools = [...new Set([...rootAgentTools])];

    // rootAgentTools = rootAgentTools.filter(x => x !== `${ToolType.BUILD_IN}:${this.id}`);
    // rootAgentTools = rootAgentTools.filter(x => x !== `${ToolType.BUILD_IN}:${AskUserQuestion.toolName}`);



    const appInfo = await appManager.getInfo();
    const observationalMemoryModel = await providersManager.getLanguageModel(
      appInfo.defaultModel?.fastModel?.trim() || rootAgentModel,
    );
    if (subagent_type == 'general-purpose') {

      subagent_type = rootAgentId ?? appInfo.defaultAgent;
    }
    const agent = await agentManager.buildAgent(subagent_type, {
      modelId: rootAgentModel,
      tools: rootAgentTools,
      disableTools: [`${ToolType.BUILD_IN}:${this.id}`, `${ToolType.BUILD_IN}:${AskUserQuestion.toolName}`],
      maxRetries: 3,
      observationalMemory: {
        model: observationalMemoryModel,
        observation: {
          messageTokens: 64_000,
        },
      },
    });
    // agent.tools

    const threadId = getSubAgentThreadId(toolCallId);
    const resourceId = `${rootResourceId}:${toolCallId}`;
    await memory.saveThread({
      thread: {
        id: threadId,
        title: `SubAgent:${toolCallId}`,
        resourceId: resourceId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          agentId: rootAgentId,
          model: rootAgentModel,
        },
      },
    });

    const _requestContext = new RequestContext<ChatRequestContext>();
    const all = requestContext.all as Record<string, any>

    Object.keys(all).forEach((key: string) => {
      _requestContext.set(key, all[key]);
    });

    _requestContext.set('isSubAgent', true);


    const runAgent = async (
      runAbortSignal: AbortSignal | undefined,
      isBackground: boolean,
    ) => {
      const streamOptions: AgentExecutionOptions = {
        includeRawChunks: false,
        modelSettings: {
          headers: {
            'X-AIME-CHAT-THREAD-ID': rootThreadId,
          },
        },
        providerOptions: {
          openai: {
            store: false,
            reasoningEffort: appInfo.defaultThink ?? undefined,
            reasoningSummary: 'auto',
          } as OpenAIChatLanguageModelOptions,
        },
        _requestContext,
        maxSteps: 100,
        memory: {
          thread: { id: threadId },
          resource: resourceId,
          options: {
            readOnly: false,
            lastMessages: false,
          },
        },
        abortSignal: runAbortSignal,
        savePerStep: true,
      };
      const stream = await agent.stream(prompt, streamOptions);

      const appendBackgroundMessage = (
        message: Omit<AgentSessionMessage, 'id' | 'createdAt'>,
      ) => {
        backgroundAgentManager.appendMessage(toolCallId, {
          ...message,
          id: nanoid(),
          createdAt: new Date().toISOString(),
        });
      };

      for await (const chunk of stream.fullStream) {
        if (isBackground && chunk.type === 'tool-call') {
          appendBackgroundMessage({
            type: 'tool-call',
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
            content: formatAgentOutput(chunk.payload.args),
          });
        } else if (isBackground && chunk.type === 'tool-result') {
          appendBackgroundMessage({
            type: 'tool-result',
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
            content: formatAgentOutput(chunk.payload.result),
            isError: chunk.payload.isError,
          });
        } else if (isBackground && chunk.type === 'tool-error') {
          appendBackgroundMessage({
            type: 'tool-result',
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
            content: formatAgentOutput(chunk.payload.error),
            isError: true,
          });
        }

        if (chunk.type === 'step-finish') {
          const { text = '', toolCalls = [] } = chunk.payload.output;
          if (text.trim()) {
            if (isBackground) {
              appendBackgroundMessage({ type: 'text', content: text });
            } else {
              await writer.write({
                type: `data-task-${toolCallId}`,
                data: { value: text, type: 'text' },
              });
            }
          }
          if (!isBackground) {
            for (const toolCall of toolCalls) {
              await writer.write({
                type: `data-task-${toolCallId}`,
                data: { value: toolCall, type: 'tool-call' },
              });
            }
          }
        }
      }

      if (runAbortSignal?.aborted) {
        return {
          status: 'aborted' as const,
          errorMessage: 'Task was aborted by the user.',
        };
      }

      const streamedText = await stream.text;
      const result =
        streamedText ||
        (await stream.content)
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n');

      if (stream.status === 'success' && !stream.error?.message) {
        return { status: 'completed' as const, result };
      }
      return {
        status: 'failed' as const,
        errorMessage: stream.error?.message || 'Agent execution failed.',
      };
    };

    if (inputData.run_in_background) {
      const backgroundAbortSignal = backgroundAgentManager.start({
        threadId: rootThreadId,
        resourceId: rootResourceId,
        sessionId: toolCallId,
        subagentThreadId: threadId,
        description,
        prompt,
        subagentType: subagent_type,
      });

      void runAgent(backgroundAbortSignal, true)
        .then((result) => backgroundAgentManager.complete(toolCallId, result))
        .catch((error) => {
          backgroundAgentManager.complete(toolCallId, {
            status: backgroundAbortSignal.aborted ? 'aborted' : 'failed',
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        });

      return `Agent running in background with ID: ${toolCallId}. You will be notified when it completes or fails.`;
    }

    const result = await runAgent(abortSignal, false);
    return result.status === 'completed'
      ? result.result
      : result.errorMessage;
  };
}
