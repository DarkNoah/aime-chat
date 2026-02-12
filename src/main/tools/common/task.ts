import { createTool, ToolExecutionContext } from '@mastra/core/tools';
import { generateText } from 'ai';
import z from 'zod';
import BaseTool, { BaseToolParams } from '../base-tool';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { nanoid } from '@/utils/nanoid';
import { SkillInfo } from '@/types/skill';
import { toolsManager } from '..';
import matter from 'gray-matter';
import { ToolType } from '@/types/tool';
import fg from 'fast-glob';
import { SubAgentInfo } from '@/types/task';
import { agentManager } from '@/main/mastra/agents';
import { providersManager } from '@/main/providers';
import { ChatTask, ChatTodo } from '@/types/chat';
import BaseToolkit, { BaseToolkitParams } from '../base-toolkit';

export interface TaskToolParams extends BaseToolParams {
  subAgents: SubAgentInfo[] | string[];
}

export class Task extends BaseTool {
  static readonly toolName = 'Task';
  id: string = 'Task';
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
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
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
  });

  constructor(config?: TaskToolParams) {
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
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
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
    const { description, prompt, subagent_type } = inputData;
    const {
      writer,
      abortSignal,
      requestContext,
      agent: agentContext,
    } = context;
    const toolCallId = agentContext.toolCallId;
    const rootAgentModel = requestContext.get('model' as never) as string;
    const agent = await agentManager.buildAgent(subagent_type, {
      modelId: rootAgentModel,
    });
    // const model = await providersManager.getLanguageModel(model);
    const stream = await agent.stream(prompt, {
      abortSignal: abortSignal,
      requestContext: requestContext,
      maxSteps: 100,
    });

    for await (const chunk of stream.fullStream) {
      if (chunk.type == 'tool-result') {
      }
      if (chunk.type === 'step-finish') {
        const { payload } = chunk;
        const { messages, output } = payload;
        const { text, toolCalls, usage } = output;
        if (text.trim()) {
          await writer.write({
            type: `data-task-${toolCallId}`,
            data: { value: text, type: 'text' },
          });
        }
        if (toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            await writer.write({
              type: `data-task-${toolCallId}`,
              data: { value: toolCall, type: 'tool-call' },
            });
          }
        }
      }

      // await writer.write(chunk);
      console.log(chunk.type);
    }
    if (abortSignal.aborted) {
      return `Task was aborted by the user.`;
    }
    // await stream.textStream.pipeTo(writer);
    // await stream.fullStream.pipeTo(writer);

    return (await stream.content)
      .filter((x) => x.type === 'text')
      .map((x) => x.text)
      .join('\n');
  };
}

export class TaskCreate extends BaseTool {
  static readonly toolName = 'TaskCreate';
  id: string = 'TaskCreate';
  description = `Use this tool to create a structured task list for your current coding session. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool

Use this tool proactively in these scenarios:

- Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
- Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
- Plan mode - When using plan mode, create a task list to track the work
- User explicitly requests todo list - When the user directly asks you to use the todo list
- User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
- After receiving new instructions - Immediately capture user requirements as tasks
- When you start working on a task - Mark it as in_progress BEFORE beginning work
- After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
- There is only a single, straightforward task
- The task is trivial and tracking it provides no organizational benefit
- The task can be completed in less than 3 trivial steps
- The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Task Fields

- **subject**: A brief, actionable title in imperative form (e.g., "Fix authentication bug in login flow")
- **description**: Detailed description of what needs to be done, including context and acceptance criteria
- **activeForm**: Present continuous form shown in spinner when task is in_progress (e.g., "Fixing authentication bug"). This is displayed to the user while you work on the task.

**IMPORTANT**: Always provide activeForm when creating tasks. The subject should be imperative ("Run tests") while activeForm should be present continuous ("Running tests"). All tasks are created with status \`pending\`.

## Tips

- Create tasks with clear, specific subjects that describe the outcome
- Include enough detail in the description for another agent to understand and complete the task
- After creating tasks, use TaskUpdate to set up dependencies (blocks/blockedBy) if needed
- Check TaskList first to avoid creating duplicate tasks`;

  inputSchema = z
    .object({
      subject: z.string().describe('A brief title for the task'),
      description: z
        .string()
        .describe('A detailed description of what needs to be done'),
      activeForm: z
        .string()
        .describe(
          'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
        )
        .optional(),
      metadata: z
        .record(z.unknown())
        .describe('Arbitrary metadata to attach to the task')
        .optional(),
    })
    .strict();

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { subject, description, activeForm, metadata } = inputData;

    const { requestContext, mastra, agent } = context;
    const threadId = requestContext.get('threadId' as never);
    const storage = mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    let currentThread = await memoryStore.getThreadById({
      threadId: threadId,
    });
    const tasks = (currentThread.metadata?.tasks as ChatTask[]) || [];

    // 生成自增 ID
    const maxId = tasks.reduce(
      (max, t) => Math.max(max, parseInt(t.taskId, 10) || 0),
      0,
    );
    const newTaskId = String(maxId + 1);

    const newTask: ChatTask = {
      taskId: newTaskId,
      subject,
      description,
      status: 'pending',
      activeForm,
      metadata,
    };

    tasks.push(newTask);

    // 持久化到 thread metadata
    currentThread = await memoryStore.updateThread({
      id: threadId,
      title: currentThread.title,
      metadata: {
        ...(currentThread.metadata || {}),
        tasks,
      },
    });

    // 同步到 requestContext 方便同一请求内后续工具读取
    requestContext.set('tasks' as never, tasks as never);

    return `Task #${newTaskId} created successfully: ${subject}`;
  };
}

export class TaskGet extends BaseTool {
  static readonly toolName = 'TaskGet';
  id: string = 'TaskGet';
  description = `Use this tool to retrieve a task by its ID from the task list.

## When to Use This Tool

- When you need the full description and context before starting work on a task
- To understand task dependencies (what it blocks, what blocks it)
- After being assigned a task, to get complete requirements

## Output

Returns full task details:
- **subject**: Task title
- **description**: Detailed requirements and context
- **status**: 'pending', 'in_progress', or 'completed'
- **blocks**: Tasks waiting on this one to complete
- **blockedBy**: Tasks that must complete before this one can start

## Tips

- After fetching a task, verify its blockedBy list is empty before beginning work.
- Use TaskList to see all tasks in summary form.
`;

  inputSchema = z
    .object({
      taskId: z.string().describe('The ID of the task to retrieve'),
    })
    .strict();

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { taskId } = inputData;

    const { requestContext, mastra, agent } = context;

    const threadId = requestContext.get('threadId' as never);
    const storage = mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const currentThread = await memoryStore.getThreadById({
      threadId: threadId,
    });
    const tasks = (currentThread.metadata?.tasks as ChatTask[]) || [];

    const task = tasks.find((x) => x.taskId === taskId);
    if (!task) {
      return `Task #${taskId} not found`;
    }

    return `Task #${task.taskId}: ${task.subject}
Status: ${task.status}
Description: ${task.description}
${task.activeForm ? `Active Form: ${task.activeForm}` : ''}
${task.metadata ? `Metadata: ${JSON.stringify(task.metadata, null, 2)}` : ''}
${task.blockedBy?.length ? `Blocked by: ${task.blockedBy.map((b) => '#' + b).join(', ')}` : ''}
${task.blocks?.length ? `Blocks: ${task.blocks.map((b) => '#' + b).join(', ')}` : ''}
${task.owner ? `Owner: ${task.owner}` : ''}`;
  };
}
export class TaskList extends BaseTool {
  static readonly toolName = 'TaskList';
  id: string = 'TaskList';
  description = `Use this tool to list all tasks in the current task list.

## When to Use This Tool

- To see an overview of all tasks and their current statuses
- Before creating new tasks, to check for duplicates
- After completing a task, to find the next task to work on
- To understand the overall progress of the current session

## Output

Returns a summary list of all tasks with:
- **taskId**: Unique identifier for each task
- **status**: 'pending', 'in_progress', or 'completed'
- **subject**: Brief task title
- **blockedBy**: Tasks that must complete before this one can start (if any)

## Tips

- Use TaskGet for full task details including description and metadata.
- Look for tasks with status 'pending' and no blockers to find your next task.
`;

  inputSchema = z.object({}).strict();

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const { requestContext, mastra, agent } = context;

    const threadId = requestContext.get('threadId' as never);
    const storage = mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    const currentThread = await memoryStore.getThreadById({
      threadId: threadId,
    });
    const tasks = (currentThread.metadata?.tasks as ChatTask[]) || [];

    if (tasks.length === 0) {
      return 'No tasks found.';
    }

    return tasks
      .map((x) => {
        return `#${x.taskId} [${x.status}] ${x.subject}${x.blockedBy?.length ? ` [blocked by ${x.blockedBy.map((b) => '#' + b).join(', ')}]` : ''}`;
      })
      .join('\n');
  };
}

export class TaskUpdate extends BaseTool {
  static readonly toolName = 'TaskUpdate';
  id: string = 'TaskUpdate';
  description = `Use this tool to update a task in the task list.

## When to Use This Tool

**Mark tasks as resolved:**
- When you have completed the work described in a task
- When a task is no longer needed or has been superseded
- IMPORTANT: Always mark your assigned tasks as resolved when you finish them
- After resolving, call TaskList to find your next task

- ONLY mark a task as completed when you have FULLY accomplished it
- If you encounter errors, blockers, or cannot finish, keep the task as in_progress
- When blocked, create a new task describing what needs to be resolved
- Never mark a task as completed if:
  - Tests are failing
  - Implementation is partial
  - You encountered unresolved errors
  - You couldn't find necessary files or dependencies

**Update task details:**
- When requirements change or become clearer
- When establishing dependencies between tasks

## Fields You Can Update

- **status**: The task status (see Status Workflow below)
- **subject**: Change the task title (imperative form, e.g., "Run tests")
- **description**: Change the task description
- **activeForm**: Present continuous form shown in spinner when in_progress (e.g., "Running tests")
- **owner**: Change the task owner (agent name)
- **metadata**: Merge metadata keys into the task (set a key to null to delete it)
- **addBlocks**: Mark tasks that cannot start until this one completes
- **addBlockedBy**: Mark tasks that must complete before this one can start

## Status Workflow

Status progresses: \`pending\` → \`in_progress\` → \`completed\`

## Staleness

Make sure to read a task's latest state using \`TaskGet\` before updating it.

## Examples

Mark task as in progress when starting work:
\`\`\`json
{"taskId": "1", "status": "in_progress"}
\`\`\`

Mark task as completed after finishing work:
\`\`\`json
{"taskId": "1", "status": "completed"}
\`\`\`

Claim a task by setting owner:
\`\`\`json
{"taskId": "1", "owner": "my-name"}
\`\`\`

Set up task dependencies:
\`\`\`json
{"taskId": "2", "addBlockedBy": ["1"]}
\`\`\`
`;

  inputSchema = z
    .object({
      taskId: z.string().describe('The ID of the task to update'),
      subject: z.string().describe('New subject for the task').optional(),
      description: z
        .string()
        .describe('New description for the task')
        .optional(),
      activeForm: z
        .string()
        .describe(
          'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
        )
        .optional(),
      status: z
        .enum(['pending', 'in_progress', 'completed'])
        .describe('New status for the task')
        .optional(),
      addBlocks: z
        .array(z.string())
        .describe('Task IDs that this task blocks')
        .optional(),
      addBlockedBy: z
        .array(z.string())
        .describe('Task IDs that block this task')
        .optional(),
      owner: z.string().describe('New owner for the task').optional(),
      metadata: z
        .record(z.unknown())
        .describe(
          'Metadata keys to merge into the task. Set a key to null to delete it.',
        )
        .optional(),
    })
    .strict();

  constructor() {
    super();
  }

  execute = async (
    inputData: z.infer<typeof this.inputSchema>,
    context: ToolExecutionContext<z.ZodSchema, any>,
  ) => {
    const {
      taskId,
      status,
      subject,
      description,
      activeForm,
      metadata,
      addBlocks,
      addBlockedBy,
      owner,
    } = inputData;
    const { requestContext, mastra, agent } = context;

    const threadId = requestContext.get('threadId' as never);
    const storage = mastra.getStorage();
    const memoryStore = await storage.getStore('memory');
    let currentThread = await memoryStore.getThreadById({
      threadId: threadId,
    });
    let tasks = (currentThread.metadata?.tasks as ChatTask[]) || [];
    const task = tasks.find((x) => x.taskId === taskId);
    if (!task) {
      return `Task #${taskId} not found`;
    }
    const updatedItems: string[] = [];
    if (status) {
      task.status = status;
      updatedItems.push('status');
    }
    if (subject) {
      task.subject = subject;
      updatedItems.push('subject');
    }
    if (description) {
      task.description = description;
      updatedItems.push('description');
    }
    if (activeForm) {
      task.activeForm = activeForm;
      updatedItems.push('activeForm');
    }

    if (metadata) {
      // metadata 采用合并策略，值为 null 则删除对应 key
      const existingMetadata = task.metadata || {};
      for (const [key, value] of Object.entries(metadata)) {
        if (value === null) {
          delete existingMetadata[key];
        } else {
          existingMetadata[key] = value;
        }
      }
      task.metadata = existingMetadata;
      updatedItems.push('metadata');
    }

    // 被阻塞 - 追加到已有列表（去重）
    if (addBlockedBy) {
      const existing = task.blockedBy || [];
      const merged = [...new Set([...existing, ...addBlockedBy])];
      task.blockedBy = merged;
      updatedItems.push('blockedBy');
    }

    // 阻塞谁 - 追加到已有列表（去重）
    if (addBlocks) {
      const existing = task.blocks || [];
      const merged = [...new Set([...existing, ...addBlocks])];
      task.blocks = merged;
      updatedItems.push('blocks');
    }

    if (owner) {
      task.owner = owner;
      updatedItems.push('owner');
    }

    if (tasks.length === tasks.filter((x) => x.status === 'completed').length) {
      tasks = [];
    }

    // 持久化更新后的任务列表到 thread metadata
    currentThread = await memoryStore.updateThread({
      id: threadId,
      title: currentThread.title,
      metadata: {
        ...(currentThread.metadata || {}),
        tasks,
      },
    });

    // 同步到 requestContext
    requestContext.set('tasks' as never, tasks as never);

    if (updatedItems.length === 0) {
      return `Task #${taskId}: no fields were updated.`;
    }
    return `Task #${taskId} updated successfully: ${updatedItems.join(', ')}`;
  };
}

export interface TodoToolkitParams extends BaseToolkitParams {}

export class TodoToolkit extends BaseToolkit {
  static readonly toolName = 'TodoToolkit';
  id: string = 'TodoToolkit';

  constructor(params?: TodoToolkitParams) {
    super(
      [new TaskCreate(), new TaskGet(), new TaskList(), new TaskUpdate()],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}

export default TodoToolkit;
